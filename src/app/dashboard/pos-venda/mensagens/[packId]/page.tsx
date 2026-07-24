import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getConversaPack } from "@/lib/mercadolivre/messages";
import { enviarMensagemPackAction, marcarComoLidoAction } from "../../actions";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { nomeConta } from "@/lib/account-colors";

const formatarDataHora = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "America/Sao_Paulo",
      }).format(new Date(iso))
    : "—";

export default async function ConversaPackPage({
  params,
  searchParams,
}: {
  params: Promise<{ packId: string }>;
  searchParams: Promise<{ conta?: string }>;
}) {
  const { podeEditar } = await exigirAcessoSecao("pos_venda", "mensagens");
  const { packId } = await params;
  const { conta: contaId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!contaId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-red-500">Link inválido: falta o parâmetro da conta.</p>
        <Link href="/dashboard/pos-venda" className="text-sm text-[var(--color-sixxis-blue)] underline">
          ← Voltar
        </Link>
      </div>
    );
  }

  const { data: conta } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname, apelido")
    .eq("id", contaId)
    .maybeSingle();

  let erro: string | null = null;
  let mensagens: Awaited<ReturnType<typeof getConversaPack>>["mensagens"] = [];

  if (conta) {
    try {
      const accessToken = await getValidAccessToken(contaId);
      const conversa = await getConversaPack(accessToken, packId, conta.ml_user_id);
      mensagens = conversa.mensagens;

      const naoLidas = mensagens
        .filter((m) => m.remetenteId !== conta.ml_user_id && !m.dataLeitura)
        .map((m) => m.id);
      if (naoLidas.length > 0) {
        await marcarComoLidoAction(contaId, naoLidas);
      }
    } catch (err) {
      console.error(`Erro ao buscar conversa ${packId}:`, err);
      erro = "Não foi possível carregar esta conversa agora.";
    }
  }

  const compradorId = conta ? mensagens.find((m) => m.remetenteId !== conta.ml_user_id)?.remetenteId : undefined;

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/dashboard/pos-venda" className="text-sm text-[var(--color-sixxis-blue)] underline">
        ← Voltar para Pós-venda
      </Link>

      <h1 className="mt-2 mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Conversa</h1>
      <p className="mb-6 text-sm text-gray-500">{conta ? nomeConta(conta) : "Conta"} · pack {packId}</p>

      {erro && <p className="mb-6 rounded bg-red-50 p-3 text-sm text-red-600">{erro}</p>}

      {conta && (
        <>
          <div className="mb-6 space-y-3 rounded border border-gray-200 bg-white p-4">
            {mensagens.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma mensagem ainda.</p>
            ) : (
              mensagens.map((m) => {
                const souEu = m.remetenteId === conta.ml_user_id;
                return (
                  <div
                    key={m.id}
                    className={`rounded p-3 text-sm ${souEu ? "ml-8 bg-blue-50" : "mr-8 bg-gray-50"}`}
                  >
                    <p className="mb-1 text-xs font-medium text-gray-500">
                      {souEu ? "Você" : m.remetenteNome ?? "Comprador"} · {formatarDataHora(m.dataRecebida)}
                    </p>
                    <p className="text-gray-800">{m.texto}</p>
                  </div>
                );
              })
            )}
          </div>

          {compradorId && podeEditar ? (
            <form action={enviarMensagemPackAction} className="flex items-start gap-2">
              <input type="hidden" name="contaId" value={contaId} />
              <input type="hidden" name="packId" value={packId} />
              <input type="hidden" name="buyerId" value={compradorId} />
              <input type="hidden" name="mlUserId" value={conta.ml_user_id} />
              <textarea
                name="mensagem"
                required
                rows={2}
                placeholder="Escreva sua resposta..."
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
              Não foi possível identificar o comprador desta conversa para responder.
            </p>
          )}
        </>
      )}
    </div>
  );
}
