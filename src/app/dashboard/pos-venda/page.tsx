import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getPerguntasNaoRespondidas, type Pergunta } from "@/lib/mercadolivre/questions";
import { getMensagensNaoLidas, type ConversaNaoLida } from "@/lib/mercadolivre/messages";
import { getReclamacoesAbertas, type Reclamacao } from "@/lib/mercadolivre/claims";
import { responderPerguntaAction } from "./actions";

const formatarDataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

const formatarHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

const formatarData = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

const REASON_LABELS: Record<string, string> = {
  mediations: "Mediação (comprador x vendedor)",
  return: "Devolução",
  fulfillment: "Envio Full",
  ml_case: "Cancelamento por envio demorado",
  cancel_sale: "Cancelamento pelo vendedor",
  cancel_purchase: "Cancelamento pelo comprador",
  change: "Troca de produto",
  service: "Cancelamento de serviço",
};

export default async function PosVendaPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: contas } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname")
    .order("nickname", { ascending: true });

  const resultados = await Promise.all(
    (contas ?? []).map(async (conta) => {
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const [perguntas, mensagens, reclamacoes] = await Promise.all([
          getPerguntasNaoRespondidas(accessToken, conta.ml_user_id, conta.id, conta.nickname),
          getMensagensNaoLidas(accessToken, conta.id, conta.nickname),
          getReclamacoesAbertas(accessToken, conta.ml_user_id, conta.id, conta.nickname),
        ]);
        return { conta, perguntas, mensagens, reclamacoes, erro: null as string | null };
      } catch (err) {
        console.error(`Erro ao buscar pos-venda de ${conta.nickname}:`, err);
        return {
          conta,
          perguntas: { total: 0, perguntas: [] as Pergunta[] },
          mensagens: { conversas: [] as ConversaNaoLida[], totalMensagens: 0 },
          reclamacoes: { total: 0, reclamacoes: [] as Reclamacao[] },
          erro: "Falha ao buscar dados desta conta.",
        };
      }
    })
  );

  const todasPerguntas = resultados
    .flatMap((r) => r.perguntas.perguntas)
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime());
  const totalPerguntas = resultados.reduce((s, r) => s + r.perguntas.total, 0);

  const todasConversas = resultados.flatMap((r) => r.mensagens.conversas);
  const totalConversasComPendencia = todasConversas.length;
  const totalMensagensNaoLidas = resultados.reduce((s, r) => s + r.mensagens.totalMensagens, 0);

  const todasReclamacoes = resultados
    .flatMap((r) => r.reclamacoes.reclamacoes)
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime());
  const totalReclamacoes = resultados.reduce((s, r) => s + r.reclamacoes.total, 0);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Pós-venda</h1>
      <p className="mb-6 text-sm text-gray-500">
        Perguntas, mensagens e reclamações em aberto — consolidado de todas as{" "}
        {contas?.length ?? 0} contas conectadas
      </p>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Perguntas não respondidas</p>
          <p className="text-xl font-bold text-gray-900">{totalPerguntas}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Conversas com mensagens novas</p>
          <p className="text-xl font-bold text-gray-900">{totalConversasComPendencia}</p>
          <p className="text-xs text-gray-400">{totalMensagensNaoLidas} mensagem(ns) não lida(s)</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Reclamações em aberto</p>
          <p className="text-xl font-bold text-gray-900">{totalReclamacoes}</p>
        </div>
      </div>

      {/* Perguntas */}
      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        Perguntas não respondidas ({todasPerguntas.length}
        {totalPerguntas > todasPerguntas.length ? ` de ${totalPerguntas}` : ""})
      </h2>
      {todasPerguntas.length === 0 ? (
        <p className="mb-8 text-sm text-gray-400">Nenhuma pergunta pendente. 🎉</p>
      ) : (
        <ul className="mb-8 divide-y divide-gray-200 rounded border border-gray-200 bg-white">
          {todasPerguntas.map((p) => (
            <li key={p.id} className="p-4">
              <div className="mb-2 flex items-center justify-between text-xs text-gray-400">
                <span>
                  {p.compradorNickname ?? (p.compradorId ? `comprador #${p.compradorId}` : "comprador não identificado")}
                  {" · "}
                  {p.contaNickname} · anúncio {p.itemId} · {formatarHora(p.dataCriacao)} · {formatarData(p.dataCriacao)}
                </span>
              </div>
              <p className="mb-3 text-sm text-gray-800">{p.texto}</p>
              <form action={responderPerguntaAction} className="flex items-start gap-2">
                <input type="hidden" name="contaId" value={p.contaId} />
                <input type="hidden" name="questionId" value={p.id} />
                <textarea
                  name="texto"
                  required
                  rows={2}
                  placeholder="Escreva a resposta..."
                  className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                />
                <button
                  type="submit"
                  className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
                >
                  Responder
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      {/* Mensagens */}
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Mensagens com pendência</h2>
      {todasConversas.length === 0 ? (
        <p className="mb-8 text-sm text-gray-400">Nenhuma mensagem pendente. 🎉</p>
      ) : (
        <ul className="mb-8 divide-y divide-gray-200 rounded border border-gray-200 bg-white">
          {todasConversas.map((c) => {
            const packId = c.resource.split("/packs/")[1]?.split("/")[0];
            return (
              <li key={`${c.contaId}-${c.resource}`}>
                <Link
                  href={packId ? `/dashboard/pos-venda/mensagens/${packId}?conta=${c.contaId}` : "#"}
                  className="flex items-center justify-between p-3 text-sm hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium text-gray-800">{c.contaNickname}</p>
                    <p className="text-xs text-gray-400">{c.resource} · clique para ver e responder</p>
                  </div>
                  <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
                    {c.quantidade} não lida{c.quantidade > 1 ? "s" : ""}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Reclamações */}
      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        Reclamações em aberto ({todasReclamacoes.length}
        {totalReclamacoes > todasReclamacoes.length ? ` de ${totalReclamacoes}` : ""})
      </h2>
      {todasReclamacoes.length === 0 ? (
        <p className="mb-8 text-sm text-gray-400">Nenhuma reclamação em aberto. 🎉</p>
      ) : (
        <ul className="mb-8 divide-y divide-gray-200 rounded border border-gray-200 bg-white">
          {todasReclamacoes.map((r) => (
            <li key={r.id}>
              <Link
                href={`/dashboard/pos-venda/reclamacoes/${r.id}?conta=${r.contaId}`}
                className="block p-3 text-sm hover:bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-800">
                    {r.contaNickname} · pedido {r.resourceId}
                  </span>
                  <span className="rounded-full bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-700">
                    {r.etapa}
                  </span>
                </div>
                <p className="text-xs text-gray-400">
                  {REASON_LABELS[r.tipo] ?? r.tipo} · aberta em {formatarDataHora(r.dataCriacao)} ·
                  atualizada em {formatarDataHora(r.ultimaAtualizacao)} · clique para ver conversa e agir →
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {resultados.some((r) => r.erro) && (
        <ul className="mb-4 text-xs text-red-500">
          {resultados
            .filter((r) => r.erro)
            .map((r) => (
              <li key={r.conta.id}>
                {r.conta.nickname}: {r.erro}
              </li>
            ))}
        </ul>
      )}

      {(!contas || contas.length === 0) && (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Nenhuma conta Mercado Livre conectada ainda.
        </div>
      )}
    </div>
  );
}
