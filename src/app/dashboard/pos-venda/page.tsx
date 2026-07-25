import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getPerguntasNaoRespondidas, getMetricasPerguntas, type Pergunta, type MetricasPerguntas } from "@/lib/mercadolivre/questions";
import { getMensagensNaoLidas, getTempoMedioAtendimento, type ConversaNaoLida } from "@/lib/mercadolivre/messages";
import { getReclamacoesAbertas, getMetricasReclamacoes, type Reclamacao, type MetricasReclamacoes } from "@/lib/mercadolivre/claims";
import { getDevolucoesNoPeriodo, type Devolucao } from "@/lib/mercadolivre/returns";
import { getVendas, periodoDeDatas } from "@/lib/mercadolivre/orders";
import { responderPerguntaAction } from "./actions";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import { temAcessoSubsecao } from "@/lib/permissoes";
import { periodoDoPreset, formatarDuracaoMin, type PresetKey } from "@/lib/date-utils";
import PosVendaPorConta, { type ContaPosVenda } from "./pos-venda-por-conta";

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

const formatarMoeda = (valor: number, moeda: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(valor);

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

const PRESETS_SLA: { key: PresetKey; label: string }[] = [
  { key: "7dias", label: "Últimos 7 dias" },
  { key: "15dias", label: "Últimos 15 dias" },
  { key: "30dias", label: "Últimos 30 dias" },
];

// Media ponderada (por numero de itens usados em cada calculo) das metricas
// por conta, para nao dar o mesmo peso a uma conta com 2 perguntas e outra
// com 200 no consolidado.
function mediaPonderada(pares: { valor: number | null; peso: number }[]): number | null {
  const validos = pares.filter((p) => p.valor !== null && p.peso > 0);
  const pesoTotal = validos.reduce((s, p) => s + p.peso, 0);
  if (pesoTotal === 0) return null;
  return validos.reduce((s, p) => s + p.valor! * p.peso, 0) / pesoTotal;
}

function SlaCard({
  titulo,
  valor,
  sub,
  metaMin,
}: {
  titulo: string;
  valor: string;
  sub?: string;
  metaMin?: number | null;
  atualMin?: number | null;
}) {
  return (
    <div className="rounded border border-gray-200 bg-white p-4">
      <p className="text-xs uppercase text-gray-400">{titulo}</p>
      <p className="text-xl font-bold text-gray-900">{valor}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
      {metaMin !== undefined && metaMin !== null && metaMin > 0 && (
        <p className="mt-1 text-xs text-gray-400">Meta: até {formatarDuracaoMin(metaMin)}</p>
      )}
    </div>
  );
}

function BadgeMeta({ atualMin, metaMin }: { atualMin: number | null; metaMin: number | null | undefined }) {
  if (!metaMin || atualMin === null) return null;
  const dentro = atualMin <= metaMin;
  return (
    <span
      className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        dentro ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"
      }`}
    >
      {dentro ? "dentro da meta" : "acima da meta"}
    </span>
  );
}

export default async function PosVendaPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; de?: string; ate?: string }>;
}) {
  const { isAdmin, permissoes, podeEditar } = await exigirAcessoSecao("pos_venda");
  const params = await searchParams;

  const verPerguntas = temAcessoSubsecao(isAdmin, permissoes, "pos_venda", "perguntas");
  const verMensagens = temAcessoSubsecao(isAdmin, permissoes, "pos_venda", "mensagens");
  const verReclamacoes = temAcessoSubsecao(isAdmin, permissoes, "pos_venda", "reclamacoes");

  const hoje = new Date();
  let de: string;
  let ate: string;
  let presetAtual: PresetKey | "personalizado";
  if (params.de && params.ate) {
    de = params.de;
    ate = params.ate;
    presetAtual = "personalizado";
  } else {
    presetAtual = PRESETS_SLA.some((p) => p.key === params.preset) ? (params.preset as PresetKey) : "7dias";
    ({ de, ate } = periodoDoPreset(presetAtual, hoje));
  }
  const periodo = { de, ate };

  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;

  const supabase = await createClient();

  const [{ data: contas }, { data: metasAtendimentoRaw }] = await Promise.all([
    supabase.from("ml_accounts").select("id, ml_user_id, nickname, apelido, cor").order("nickname", { ascending: true }),
    supabase.from("metas_atendimento").select("tipo_meta, valor_minutos").eq("ano", anoAtual).eq("mes", mesAtual),
  ]);

  const metasAtendimento = new Map(
    (metasAtendimentoRaw ?? []).map((m) => [m.tipo_meta as string, Number(m.valor_minutos)])
  );

  const resultados = await Promise.all(
    (contas ?? []).map(async (conta) => {
      const nome = nomeConta(conta);
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const [perguntas, mensagens, reclamacoesAbertas, metricasPerguntas, metricasReclamacoes, devolucoes, vendasPeriodo] =
          await Promise.all([
            verPerguntas
              ? getPerguntasNaoRespondidas(accessToken, conta.ml_user_id, conta.id, nome)
              : Promise.resolve({ total: 0, perguntas: [] as Pergunta[] }),
            verMensagens
              ? getMensagensNaoLidas(accessToken, conta.id, nome)
              : Promise.resolve({ conversas: [] as ConversaNaoLida[], totalMensagens: 0 }),
            verReclamacoes
              ? getReclamacoesAbertas(accessToken, conta.ml_user_id, conta.id, nome)
              : Promise.resolve({ total: 0, reclamacoes: [] as Reclamacao[] }),
            verPerguntas
              ? getMetricasPerguntas(accessToken, conta.ml_user_id, periodo)
              : Promise.resolve(null as MetricasPerguntas | null),
            verReclamacoes
              ? getMetricasReclamacoes(accessToken, conta.ml_user_id, periodo)
              : Promise.resolve(null as MetricasReclamacoes | null),
            verReclamacoes
              ? getDevolucoesNoPeriodo(accessToken, conta.ml_user_id, periodo, conta.id, nome)
              : Promise.resolve({ abertas: [] as Devolucao[], concluidas: [] as Devolucao[], custoTotal: 0 }),
            verMensagens
              ? getVendas(accessToken, conta.ml_user_id, periodoDeDatas(de, ate), conta.id, nome)
              : Promise.resolve(null),
          ]);

        let tempoMedioMensagens: { tempoMedioMin: number | null; conversasAnalisadas: number } = {
          tempoMedioMin: null,
          conversasAnalisadas: 0,
        };
        if (verMensagens && vendasPeriodo) {
          const packIds = vendasPeriodo.pedidos.map((p) => p.packId);
          tempoMedioMensagens = await getTempoMedioAtendimento(accessToken, conta.ml_user_id, packIds);
        }

        return {
          conta,
          nome,
          perguntas,
          mensagens,
          reclamacoesAbertas,
          metricasPerguntas,
          metricasReclamacoes,
          devolucoes,
          tempoMedioMensagens,
          erro: null as string | null,
        };
      } catch (err) {
        console.error(`Erro ao buscar pos-venda de ${conta.nickname}:`, err);
        return {
          conta,
          nome,
          perguntas: { total: 0, perguntas: [] as Pergunta[] },
          mensagens: { conversas: [] as ConversaNaoLida[], totalMensagens: 0 },
          reclamacoesAbertas: { total: 0, reclamacoes: [] as Reclamacao[] },
          metricasPerguntas: null as MetricasPerguntas | null,
          metricasReclamacoes: null as MetricasReclamacoes | null,
          devolucoes: { abertas: [] as Devolucao[], concluidas: [] as Devolucao[], custoTotal: 0 },
          tempoMedioMensagens: { tempoMedioMin: null as number | null, conversasAnalisadas: 0 },
          erro: "Falha ao buscar dados desta conta.",
        };
      }
    })
  );

  // --- Consolidado do cabeçalho (mantido como estava, + devoluções) ---
  const totalPerguntas = resultados.reduce((s, r) => s + r.perguntas.total, 0);
  const todasConversas = resultados.flatMap((r) => r.mensagens.conversas);
  const totalConversasComPendencia = todasConversas.length;
  const totalMensagensNaoLidas = resultados.reduce((s, r) => s + r.mensagens.totalMensagens, 0);
  const todasReclamacoesAbertas = resultados
    .flatMap((r) => r.reclamacoesAbertas.reclamacoes)
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime());
  const totalReclamacoesAbertas = resultados.reduce((s, r) => s + r.reclamacoesAbertas.total, 0);

  const devolucoesAbertas = resultados.flatMap((r) => r.devolucoes.abertas);
  const devolucoesConcluidas = resultados.flatMap((r) => r.devolucoes.concluidas);
  const custoDevolucoesTotal = resultados.reduce((s, r) => s + r.devolucoes.custoTotal, 0);
  const moedaDevolucoes = [...devolucoesAbertas, ...devolucoesConcluidas].find((d) => d.moeda)?.moeda ?? "BRL";

  // --- SLA de atendimento (tempo real, dentro do periodo selecionado) ---
  const totalRecebidasPerguntas = resultados.reduce((s, r) => s + (r.metricasPerguntas?.totalRecebidas ?? 0), 0);
  const totalRespondidasPerguntas = resultados.reduce((s, r) => s + (r.metricasPerguntas?.totalRespondidas ?? 0), 0);
  const taxaRespostaPerguntas = totalRecebidasPerguntas > 0 ? (totalRespondidasPerguntas / totalRecebidasPerguntas) * 100 : null;
  const tempoMedioRespostaPerguntas = mediaPonderada(
    resultados.map((r) => ({ valor: r.metricasPerguntas?.tempoMedioRespostaMin ?? null, peso: r.metricasPerguntas?.totalRespondidas ?? 0 }))
  );

  const tempoMedioAtendimentoMensagens = mediaPonderada(
    resultados.map((r) => ({ valor: r.tempoMedioMensagens.tempoMedioMin, peso: r.tempoMedioMensagens.conversasAnalisadas }))
  );

  const totalFechadasReclamacoes = resultados.reduce((s, r) => s + (r.metricasReclamacoes?.totalFechadasNoPeriodo ?? 0), 0);
  const tempoMedioResolucaoReclamacoes = mediaPonderada(
    resultados.map((r) => ({ valor: r.metricasReclamacoes?.tempoMedioResolucaoMin ?? null, peso: r.metricasReclamacoes?.totalFechadasNoPeriodo ?? 0 }))
  );

  // --- Dados por conta para o accordion de Perguntas/Mensagens ---
  const contasPosVenda: ContaPosVenda[] = resultados.map((r) => ({
    id: r.conta.id as string,
    nome: r.nome,
    cor: (r.conta.cor as string) ?? COR_PADRAO,
    erro: r.erro,
    perguntas: r.perguntas.perguntas.map((p) => ({
      id: p.id,
      texto: p.texto,
      itemId: p.itemId,
      compradorLabel: p.compradorNickname ?? (p.compradorId ? `comprador #${p.compradorId}` : "comprador não identificado"),
      dataLabel: `${formatarHora(p.dataCriacao)} · ${formatarData(p.dataCriacao)}`,
      contaId: p.contaId,
    })),
    mensagens: r.mensagens.conversas.map((c) => ({
      packId: c.resource.split("/packs/")[1]?.split("/")[0] ?? null,
      resource: c.resource,
      quantidade: c.quantidade,
      contaId: c.contaId,
    })),
  }));

  const periodoLabelSla =
    presetAtual === "personalizado"
      ? `${formatarData(`${de}T12:00:00`)} – ${formatarData(`${ate}T12:00:00`)}`
      : PRESETS_SLA.find((p) => p.key === presetAtual)?.label ?? "período selecionado";

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Pós-venda</h1>
      <p className="mb-6 text-sm text-gray-500">
        Perguntas, mensagens e reclamações em aberto — consolidado de todas as{" "}
        {contas?.length ?? 0} contas conectadas
      </p>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {verPerguntas && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase text-gray-400">Perguntas não respondidas</p>
            <p className="text-xl font-bold text-gray-900">{totalPerguntas}</p>
          </div>
        )}
        {verMensagens && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase text-gray-400">Conversas com mensagens novas</p>
            <p className="text-xl font-bold text-gray-900">{totalConversasComPendencia}</p>
            <p className="text-xs text-gray-400">{totalMensagensNaoLidas} mensagem(ns) não lida(s)</p>
          </div>
        )}
        {verReclamacoes && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase text-gray-400">Reclamações em aberto</p>
            <p className="text-xl font-bold text-gray-900">{totalReclamacoesAbertas}</p>
          </div>
        )}
        {verReclamacoes && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase text-gray-400">Devoluções no período</p>
            <p className="text-xl font-bold text-gray-900">
              {devolucoesAbertas.length} aberta{devolucoesAbertas.length === 1 ? "" : "s"} · {devolucoesConcluidas.length} concluída
              {devolucoesConcluidas.length === 1 ? "" : "s"}
            </p>
            {custoDevolucoesTotal > 0 && (
              <p className="text-xs text-gray-400">Custo no período: {formatarMoeda(custoDevolucoesTotal, moedaDevolucoes)}</p>
            )}
          </div>
        )}
      </div>

      {/* Filtro de periodo para SLA e Devolucoes */}
      <form className="mb-4 flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs text-gray-500">De</label>
          <input type="date" name="de" defaultValue={de} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Até</label>
          <input type="date" name="ate" defaultValue={ate} className="rounded border border-gray-300 px-2 py-1 text-sm" />
        </div>
        <button type="submit" className="rounded bg-[var(--color-sixxis-navy)] px-4 py-1.5 text-sm font-medium text-white">
          Aplicar período
        </button>
      </form>
      <div className="mb-8 flex flex-wrap gap-2">
        {PRESETS_SLA.map((p) => (
          <Link
            key={p.key}
            href={`/dashboard/pos-venda?preset=${p.key}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              presetAtual === p.key
                ? "bg-[var(--color-sixxis-navy)] text-white"
                : "border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {/* SLA de atendimento */}
      {(verPerguntas || verMensagens || verReclamacoes) && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            SLA de atendimento <span className="font-normal text-gray-400">— {periodoLabelSla}</span>
          </h2>
          <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {verPerguntas && (
              <SlaCard
                titulo="Taxa de resposta (perguntas)"
                valor={taxaRespostaPerguntas !== null ? `${taxaRespostaPerguntas.toFixed(0)}%` : "—"}
                sub={`${totalRespondidasPerguntas} de ${totalRecebidasPerguntas} no período`}
              />
            )}
            {verPerguntas && (
              <div className="rounded border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase text-gray-400">
                  Tempo médio de resposta (perguntas)
                  <BadgeMeta atualMin={tempoMedioRespostaPerguntas} metaMin={metasAtendimento.get("sla_perguntas")} />
                </p>
                <p className="text-xl font-bold text-gray-900">{formatarDuracaoMin(tempoMedioRespostaPerguntas)}</p>
                {metasAtendimento.has("sla_perguntas") && (
                  <p className="text-xs text-gray-400">Meta: até {formatarDuracaoMin(metasAtendimento.get("sla_perguntas")!)}</p>
                )}
              </div>
            )}
            {verMensagens && (
              <div className="rounded border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase text-gray-400">
                  Tempo médio de atendimento (mensagens)
                  <BadgeMeta atualMin={tempoMedioAtendimentoMensagens} metaMin={metasAtendimento.get("sla_mensagens")} />
                </p>
                <p className="text-xl font-bold text-gray-900">{formatarDuracaoMin(tempoMedioAtendimentoMensagens)}</p>
                {metasAtendimento.has("sla_mensagens") && (
                  <p className="text-xs text-gray-400">Meta: até {formatarDuracaoMin(metasAtendimento.get("sla_mensagens")!)}</p>
                )}
              </div>
            )}
            {verReclamacoes && (
              <div className="rounded border border-gray-200 bg-white p-4">
                <p className="text-xs uppercase text-gray-400">
                  Tempo médio de resolução (reclamações)
                  <BadgeMeta atualMin={tempoMedioResolucaoReclamacoes} metaMin={metasAtendimento.get("tempo_reclamacoes")} />
                </p>
                <p className="text-xl font-bold text-gray-900">{formatarDuracaoMin(tempoMedioResolucaoReclamacoes)}</p>
                <p className="text-xs text-gray-400">{totalFechadasReclamacoes} fechada(s) no período</p>
                {metasAtendimento.has("tempo_reclamacoes") && (
                  <p className="text-xs text-gray-400">Meta: até {formatarDuracaoMin(metasAtendimento.get("tempo_reclamacoes")!)}</p>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {/* Perguntas e Mensagens por conta */}
      {(verPerguntas || verMensagens) && contasPosVenda.length > 0 && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Perguntas e mensagens por conta</h2>
          <div className="mb-8">
            <PosVendaPorConta
              contas={contasPosVenda}
              podeEditar={podeEditar}
              responderPerguntaAction={responderPerguntaAction}
              mostrarPerguntas={verPerguntas}
              mostrarMensagens={verMensagens}
            />
          </div>
        </>
      )}

      {/* Reclamações */}
      {verReclamacoes && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">
            Reclamações em aberto ({todasReclamacoesAbertas.length}
            {totalReclamacoesAbertas > todasReclamacoesAbertas.length ? ` de ${totalReclamacoesAbertas}` : ""})
          </h2>
          {todasReclamacoesAbertas.length === 0 ? (
            <p className="mb-8 text-sm text-gray-400">Nenhuma reclamação em aberto. 🎉</p>
          ) : (
            <ul className="mb-8 divide-y divide-gray-200 rounded border border-gray-200 bg-white">
              {todasReclamacoesAbertas.map((r) => (
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
                      atualizada em {formatarDataHora(r.ultimaAtualizacao)} · clique para ver conversa{podeEditar ? " e agir" : ""} →
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {/* Devoluções */}
          {(devolucoesAbertas.length > 0 || devolucoesConcluidas.length > 0) && (
            <>
              <h2 className="mb-2 text-sm font-semibold text-gray-700">
                Devoluções no período ({devolucoesAbertas.length + devolucoesConcluidas.length})
              </h2>
              <ul className="mb-8 divide-y divide-gray-200 rounded border border-gray-200 bg-white">
                {[...devolucoesAbertas, ...devolucoesConcluidas].map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/dashboard/pos-venda/reclamacoes/${d.claimId}?conta=${d.contaId}`}
                      className="block p-3 text-sm hover:bg-gray-50"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-800">
                          {d.contaNickname} · reclamação {d.claimId}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            d.dataFechamento ? "bg-gray-100 text-gray-500" : "bg-yellow-50 text-yellow-700"
                          }`}
                        >
                          {d.dataFechamento ? "concluída" : "em aberto"} · {d.status}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400">
                        {d.subtipo} · criada em {formatarDataHora(d.dataCriacao)}
                        {d.dataFechamento && ` · encerrada em ${formatarDataHora(d.dataFechamento)}`}
                        {d.custo !== null && d.moeda && ` · custo: ${formatarMoeda(d.custo, d.moeda)}`}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

      {resultados.some((r) => r.erro) && (
        <ul className="mb-4 text-xs text-red-500">
          {resultados
            .filter((r) => r.erro)
            .map((r) => (
              <li key={r.conta.id}>
                {nomeConta(r.conta)}: {r.erro}
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
