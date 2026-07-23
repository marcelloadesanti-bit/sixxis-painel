import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getClaimDetalhe, getMensagensClaim } from "@/lib/mercadolivre/claims";
import ConfirmButton from "../../../confirm-button";
import { enviarMensagemReclamacaoAction, abrirDisputaAction, reembolsarAction } from "../../actions";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";

const formatarDataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

const PAPEL_LABEL: Record<string, string> = {
  complainant: "Comprador",
  respondent: "Vendedor (você)",
  mediator: "Mercado Livre (mediador)",
};

const RECEIVER_ACTION_MAP: Record<string, "complainant" | "mediator" | "respondent"> = {
  send_message_to_complainant: "complainant",
  send_message_to_mediator: "mediator",
  send_message_to_respondent: "respondent",
};

export default async function DetalheReclamacaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ conta?: string }>;
}) {
  const { podeEditar } = await exigirAcessoSecao("pos_venda", "reclamacoes");
  const { id } = await params;
  const { conta: contaId } = await searchParams;
  const claimId = Number(id);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!contaId || !claimId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-red-500">Link inválido: faltam parâmetros da conta ou da reclamação.</p>
        <Link href="/dashboard/pos-venda" className="text-sm text-[var(--color-sixxis-blue)] underline">
          ← Voltar
        </Link>
      </div>
    );
  }

  const { data: conta } = await supabase
    .from("ml_accounts")
    .select("id, nickname")
    .eq("id", contaId)
    .maybeSingle();

  let erro: string | null = null;
  let claim: Awaited<ReturnType<typeof getClaimDetalhe>> | null = null;
  let mensagens: Awaited<ReturnType<typeof getMensagensClaim>> = [];

  try {
    const accessToken = await getValidAccessToken(contaId);
    [claim, mensagens] = await Promise.all([
      getClaimDetalhe(accessToken, claimId),
      getMensagensClaim(accessToken, claimId),
    ]);
  } catch (err) {
    console.error(`Erro ao buscar reclamação ${claimId}:`, err);
    erro = "Não foi possível carregar os detalhes desta reclamação agora.";
  }

  const respondente = claim?.players.find((p) => p.role === "respondent");
  const acoes = new Set(respondente?.acoesDisponiveis.map((a) => a.action) ?? []);
  const opcoesDestinatario = Object.entries(RECEIVER_ACTION_MAP)
    .filter(([action]) => acoes.has(action))
    .map(([, role]) => role);

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/dashboard/pos-venda" className="text-sm text-[var(--color-sixxis-blue)] underline">
        ← Voltar para Pós-venda
      </Link>

      <h1 className="mt-2 mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">
        Reclamação #{claimId}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        {conta?.nickname ?? "Conta"} · pedido {claim?.resourceId ?? "—"}
      </p>

      {erro && <p className="mb-6 rounded bg-red-50 p-3 text-sm text-red-600">{erro}</p>}

      {claim && (
        <>
          <div className="mb-6 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-yellow-50 px-2 py-1 font-medium text-yellow-700">
              Etapa: {claim.etapa}
            </span>
            <span className="rounded-full bg-gray-100 px-2 py-1 font-medium text-gray-600">
              Status: {claim.status}
            </span>
            {claim.reasonId && (
              <span className="rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-600">
                Motivo: {claim.reasonId}
              </span>
            )}
          </div>

          {podeEditar && (acoes.has("refund") || acoes.has("open_dispute")) && (
            <div className="mb-6 flex flex-wrap gap-2">
              {acoes.has("refund") && (
                <form action={reembolsarAction}>
                  <input type="hidden" name="contaId" value={contaId} />
                  <input type="hidden" name="claimId" value={claimId} />
                  <ConfirmButton
                    confirmText="Confirma o reembolso total do valor pago pelo comprador? Essa ação é irreversível."
                    className="rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Reembolsar comprador (total)
                  </ConfirmButton>
                </form>
              )}
              {acoes.has("open_dispute") && (
                <form action={abrirDisputaAction}>
                  <input type="hidden" name="contaId" value={contaId} />
                  <input type="hidden" name="claimId" value={claimId} />
                  <ConfirmButton
                    confirmText="Confirma abrir mediação (disputa) com o Mercado Livre para esta reclamação?"
                    className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Abrir disputa / mediação
                  </ConfirmButton>
                </form>
              )}
            </div>
          )}

          <h2 className="mb-2 text-sm font-semibold text-gray-700">Conversa</h2>
          <div className="mb-6 space-y-3 rounded border border-gray-200 bg-white p-4">
            {mensagens.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma mensagem ainda.</p>
            ) : (
              mensagens.map((m, i) => (
                <div
                  key={i}
                  className={`rounded p-3 text-sm ${
                    m.senderRole === "respondent" ? "ml-8 bg-blue-50" : "mr-8 bg-gray-50"
                  }`}
                >
                  <p className="mb-1 text-xs font-medium text-gray-500">
                    {PAPEL_LABEL[m.senderRole] ?? m.senderRole} → {PAPEL_LABEL[m.receiverRole] ?? m.receiverRole} ·{" "}
                    {formatarDataHora(m.dataCriacao)}
                  </p>
                  <p className="text-gray-800">{m.mensagem}</p>
                </div>
              ))
            )}
          </div>

          {opcoesDestinatario.length > 0 && podeEditar ? (
            <form action={enviarMensagemReclamacaoAction} className="flex items-start gap-2">
              <input type="hidden" name="contaId" value={contaId} />
              <input type="hidden" name="claimId" value={claimId} />
              {opcoesDestinatario.length > 1 ? (
                <select name="receiverRole" className="rounded border border-gray-300 px-2 py-1 text-sm">
                  {opcoesDestinatario.map((role) => (
                    <option key={role} value={role}>
                      {PAPEL_LABEL[role]}
                    </option>
                  ))}
                </select>
              ) : (
                <input type="hidden" name="receiverRole" value={opcoesDestinatario[0]} />
              )}
              <textarea
                name="mensagem"
                required
                rows={2}
                placeholder="Escreva sua mensagem..."
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <button
                type="submit"
                className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
              >
                Enviar
              </button>
            </form>
          ) : !podeEditar ? (
            <p className="text-xs italic text-gray-400">Acesso somente leitura.</p>
          ) : (
            <p className="text-xs text-gray-400">
              Não há ação de envio de mensagem disponível para esta reclamação no momento.
            </p>
          )}
        </>
      )}
    </div>
  );
}
