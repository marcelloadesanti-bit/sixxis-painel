import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getVendas, periodoDeDatas, type Pedido } from "@/lib/mercadolivre/orders";
import { getVendasPorEstadoComCache } from "@/lib/mercadolivre/estado-cache";
import { montarLinhasMargem, consolidarMargem, montarRankingPorSku, type LinhaMargem } from "@/lib/mercadolivre/margem";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { nomeConta } from "@/lib/account-colors";
import MargemExtratoLinha, { type LinhaMargemExtrato } from "./extrato-linha";
import { DollarSign, Receipt, TrendingUp, Percent } from "lucide-react";

// Financeiro > Margem Bruta -- roda em paralelo a Vendas, reaproveitando
// exatamente os mesmos dados (getVendas ja traz taxaPlataforma de graca) e o
// mesmo cache permanente de frete por pedido que "Vendas por estado" ja usa
// (pedido_envio_cache, ver estado-cache.ts) -- por isso NAO precisa de
// nenhuma tabela nova nem de nenhuma chamada extra a API alem do que o
// painel ja fazia. So os pedidos ainda nao cacheados (primeira vez que um
// periodo e aberto) entram na fila de resolucao desta carga, protegida pelo
// mesmo teto de seguranca (ver getVendasPorEstadoComCache).
//
// 03/08/2026: "Margem Bruta" aqui NAO inclui custo de produto (CMV) --
// isso fica para a futura aba Financeiro > Custos (em standby). A formula
// atual e Venda bruta - Comissao da plataforma - Frete (ver lib/mercadolivre
// /margem.ts para o detalhamento e as decisoes de calculo).
export const maxDuration = 300;

const PEDIDOS_POR_PAGINA = 15;

function formatarData(d: Date) {
  return d.toISOString().slice(0, 10);
}
function primeiroDiaDoMes(ref: Date) {
  return new Date(ref.getFullYear(), ref.getMonth(), 1);
}
function ultimoDiaDoMesAnterior(ref: Date) {
  return new Date(ref.getFullYear(), ref.getMonth(), 0);
}
function primeiroDiaDoMesAnterior(ref: Date) {
  return new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
}

const formatarMoeda = (valor: number, moeda: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(valor);

const formatarPct = (v: number | null) => (v !== null ? `${v.toFixed(1).replace(".", ",")}%` : "—");

const formatarDataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

function corMargem(pct: number | null): LinhaMargemExtrato["margemCor"] {
  if (pct === null) return "neutro";
  if (pct < 0) return "vermelho";
  if (pct < 15) return "amarelo";
  return "verde";
}

export default async function MargemBrutaPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; conta?: string; pagina?: string; ordemSku?: string }>;
}) {
  await exigirAcessoSecao("faturamento", "fat_margem");
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const hoje = new Date();
  const de = params.de ?? formatarData(primeiroDiaDoMes(hoje));
  const ate = params.ate ?? formatarData(hoje);
  const filtroConta = params.conta ?? "todas";
  const paginaSolicitada = Math.max(1, Number(params.pagina) || 1);
  const ordemSku = params.ordemSku === "menor" ? "menor" : "maior";

  const periodo = periodoDeDatas(de, ate);

  const { data: contasBase } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname, apelido, cor")
    .order("nickname", { ascending: true });

  const contasParaBuscar = (contasBase ?? []).filter((c) => filtroConta === "todas" || c.id === filtroConta);

  const resultados = await Promise.all(
    contasParaBuscar.map(async (conta) => {
      const nome = nomeConta(conta);
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const vendas = await getVendas(accessToken, conta.ml_user_id, periodo, conta.id, nome);
        return { conta, nome, vendas, accessToken, erro: null as string | null };
      } catch (err) {
        console.error(`Erro ao buscar vendas de ${conta.nickname} (Margem Bruta):`, err);
        return { conta, nome, vendas: null, accessToken: null as string | null, erro: "Falha ao buscar vendas desta conta." };
      }
    })
  );

  const tokensPorConta = new Map<string, string>();
  for (const r of resultados) if (r.accessToken) tokensPorConta.set(r.conta.id, r.accessToken);

  const todosPedidos: Pedido[] = resultados
    .flatMap((r) => r.vendas?.pedidos ?? [])
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime());

  const moeda = resultados.find((r) => r.vendas?.moeda)?.vendas?.moeda ?? "BRL";
  const algumErro = resultados.some((r) => r.erro);

  // Frete por pedido: mesmo cache permanente de "Vendas por estado"
  // (pedido_envio_cache) -- so reaproveita o mapa custoFretePorPedido, sem
  // usar estadoPorPedido/porEstado aqui (nao e o foco desta pagina).
  const pedidosPorContaTodos = new Map<string, { id: number; dataCriacao: string }[]>();
  for (const p of todosPedidos) {
    if (!pedidosPorContaTodos.has(p.contaId)) pedidosPorContaTodos.set(p.contaId, []);
    pedidosPorContaTodos.get(p.contaId)!.push({ id: p.id, dataCriacao: p.dataCriacao });
  }
  let custoFretePorPedido = new Map<number, number | null>();
  try {
    const resultadoFrete = await getVendasPorEstadoComCache(supabase, pedidosPorContaTodos, tokensPorConta);
    custoFretePorPedido = resultadoFrete.custoFretePorPedido;
  } catch (err) {
    console.error("Erro ao resolver frete para Margem Bruta:", err);
  }

  const linhasMargem: LinhaMargem[] = montarLinhasMargem(todosPedidos, custoFretePorPedido);
  const consolidado = consolidarMargem(linhasMargem, moeda);
  const rankingSku = montarRankingPorSku(todosPedidos, custoFretePorPedido).filter((i) => i.quantidade > 0);
  const rankingOrdenado = [...rankingSku].sort((a, b) =>
    ordemSku === "maior" ? (b.margemPct ?? -Infinity) - (a.margemPct ?? -Infinity) : (a.margemPct ?? Infinity) - (b.margemPct ?? Infinity)
  );
  const topSku = rankingOrdenado.slice(0, 8);

  // --- Paginacao do extrato (mesmo padrao de Vendas: 15 em 15) ---
  const totalPaginas = Math.max(1, Math.ceil(linhasMargem.length / PEDIDOS_POR_PAGINA));
  const paginaAtual = Math.min(paginaSolicitada, totalPaginas);
  const linhasPagina = linhasMargem.slice((paginaAtual - 1) * PEDIDOS_POR_PAGINA, paginaAtual * PEDIDOS_POR_PAGINA);

  const linhasExtrato: LinhaMargemExtrato[] = linhasPagina.map((l) => ({
    id: l.id,
    dataHoraLabel: formatarDataHora(l.dataCriacao),
    contaNickname: l.contaNickname,
    comprador: l.comprador,
    produto: l.produto,
    vendaBrutaLabel: formatarMoeda(l.vendaBruta, l.moeda),
    taxaLabel: formatarMoeda(l.taxaPlataforma, l.moeda),
    freteLabel: l.custoFrete !== null ? formatarMoeda(l.custoFrete, l.moeda) : null,
    margemValorLabel: l.margemValor !== null ? formatarMoeda(l.margemValor, l.moeda) : null,
    margemPctLabel: l.margemPct !== null ? formatarPct(l.margemPct) : null,
    margemCor: corMargem(l.margemPct),
  }));

  function hrefComQuery(overrides: Record<string, string>) {
    const q = new URLSearchParams({ de, ate, conta: filtroConta, ordemSku, ...overrides });
    return `/dashboard/financeiro/margem?${q.toString()}`;
  }

  const presets: { label: string; de: string; ate: string }[] = [
    { label: "Hoje", de: formatarData(hoje), ate: formatarData(hoje) },
    { label: "Últimos 7 dias", de: formatarData(new Date(Date.now() - 6 * 86400000)), ate: formatarData(hoje) },
    { label: "Últimos 30 dias", de: formatarData(new Date(Date.now() - 29 * 86400000)), ate: formatarData(hoje) },
    { label: "Este mês", de: formatarData(primeiroDiaDoMes(hoje)), ate: formatarData(hoje) },
    { label: "Mês passado", de: formatarData(primeiroDiaDoMesAnterior(hoje)), ate: formatarData(ultimoDiaDoMesAnterior(hoje)) },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <div className="mb-6">
        <Link href="/dashboard/faturamento" className="text-sm text-[var(--color-sixxis-blue)] underline">
          ← Financeiro
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Margem Bruta</h1>
        <p className="mt-1 text-sm text-gray-500">
          Venda bruta − comissão da plataforma − frete, pedido a pedido. Ainda não inclui custo de produto (fica
          para a aba Custos) -- por enquanto é a margem depois dos custos de canal.
        </p>
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4 dark:border-gray-700">
        <div>
          <label className="mb-1 block text-xs text-gray-500">De</label>
          <input
            type="date"
            name="de"
            defaultValue={de}
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Até</label>
          <input
            type="date"
            name="ate"
            defaultValue={ate}
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Conta</label>
          <select
            name="conta"
            defaultValue={filtroConta}
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="todas">Todas as contas</option>
            {(contasBase ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {nomeConta(c)}
              </option>
            ))}
          </select>
        </div>
        <input type="hidden" name="ordemSku" value={ordemSku} />
        <button type="submit" className="rounded bg-[var(--color-sixxis-navy)] px-4 py-1.5 text-sm font-medium text-white">
          Aplicar
        </button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        {presets.map((p) => {
          const ativo = p.de === de && p.ate === ate;
          return (
            <Link
              key={p.label}
              href={hrefComQuery({ de: p.de, ate: p.ate })}
              className={`rounded-full px-3 py-1.5 text-sm ${
                ativo
                  ? "bg-[var(--color-sixxis-navy)] text-white"
                  : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      {algumErro && (
        <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-xs text-red-600">
          Uma ou mais contas falharam ao buscar vendas neste período -- os números abaixo podem estar incompletos.
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-gray-400">Venda bruta</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatarMoeda(consolidado.vendaBruta, consolidado.moeda)}
              </p>
              <p className="text-xs text-gray-400">{consolidado.totalPedidos} pedidos</p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-sixxis-blue)]">
              <DollarSign className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-gray-400">Custos (comissão + frete)</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatarMoeda(consolidado.taxaPlataforma + consolidado.custoFrete, consolidado.moeda)}
              </p>
              <p className="text-xs text-gray-400">
                Comissão {formatarMoeda(consolidado.taxaPlataforma, consolidado.moeda)} · Frete{" "}
                {formatarMoeda(consolidado.custoFrete, consolidado.moeda)}
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-500">
              <Receipt className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-gray-400">Margem bruta (R$)</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {formatarMoeda(consolidado.margemValor, consolidado.moeda)}
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--color-sixxis-navy)]">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
        <div
          className={`rounded-xl border p-4 shadow-sm ${
            corMargem(consolidado.margemPct) === "vermelho"
              ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
              : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase text-gray-400">Margem bruta (%)</p>
              <p className={`text-2xl font-bold ${CORES_TEXTO[corMargem(consolidado.margemPct)]}`}>
                {formatarPct(consolidado.margemPct)}
              </p>
              {consolidado.amostraParcialFrete && (
                <p className="text-xs text-amber-600">
                  Amostra parcial: frete ainda calculando em {consolidado.pedidosSemFreteResolvido} pedido
                  {consolidado.pedidosSemFreteResolvido === 1 ? "" : "s"} (recarregue a página em instantes).
                </p>
              )}
            </div>
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                corMargem(consolidado.margemPct) === "vermelho"
                  ? "bg-red-500"
                  : corMargem(consolidado.margemPct) === "amarelo"
                    ? "bg-amber-500"
                    : corMargem(consolidado.margemPct) === "verde"
                      ? "bg-green-600"
                      : "bg-gray-400"
              }`}
            >
              <Percent className="h-5 w-5 text-white" />
            </div>
          </div>
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">SKUs por margem</h2>
          <div className="flex gap-2">
            <Link
              href={hrefComQuery({ ordemSku: "maior" })}
              className={`rounded-full px-3 py-1 text-xs ${
                ordemSku === "maior"
                  ? "bg-[var(--color-sixxis-navy)] text-white"
                  : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300"
              }`}
            >
              Maior margem
            </Link>
            <Link
              href={hrefComQuery({ ordemSku: "menor" })}
              className={`rounded-full px-3 py-1 text-xs ${
                ordemSku === "menor"
                  ? "bg-[var(--color-sixxis-navy)] text-white"
                  : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300"
              }`}
            >
              Menor margem
            </Link>
          </div>
        </div>
        {topSku.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum SKU vendido neste período.</p>
        ) : (
          <div className="overflow-x-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                  <th className="p-3">Produto</th>
                  <th className="p-3 text-right">Qtd.</th>
                  <th className="p-3 text-right">Venda bruta</th>
                  <th className="p-3 text-right">Margem</th>
                  <th className="p-3 text-right">Margem %</th>
                </tr>
              </thead>
              <tbody>
                {topSku.map((item) => (
                  <tr key={item.itemId} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                    <td className="max-w-xs truncate p-3">{item.titulo}</td>
                    <td className="p-3 text-right">{item.quantidade}</td>
                    <td className="p-3 text-right">{formatarMoeda(item.valor, moeda)}</td>
                    <td className="p-3 text-right">{formatarMoeda(item.margemValor, moeda)}</td>
                    <td className={`p-3 text-right font-medium ${CORES_TEXTO[corMargem(item.margemPct)]}`}>
                      {formatarPct(item.margemPct)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Extrato de pedidos</h2>
      {linhasMargem.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          Nenhum pedido pago encontrado neste período.
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded border border-gray-200 dark:border-gray-700">
            {linhasExtrato.map((linha) => (
              <MargemExtratoLinha key={linha.id} linha={linha} />
            ))}
          </div>

          {totalPaginas > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              {paginaAtual > 1 ? (
                <Link
                  href={hrefComQuery({ pagina: String(paginaAtual - 1) })}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  ← Anterior
                </Link>
              ) : (
                <span className="rounded border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-300 dark:border-gray-700 dark:text-gray-600">
                  ← Anterior
                </span>
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Página {paginaAtual} de {totalPaginas} ({linhasMargem.length} pedidos)
              </span>
              {paginaAtual < totalPaginas ? (
                <Link
                  href={hrefComQuery({ pagina: String(paginaAtual + 1) })}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Próxima →
                </Link>
              ) : (
                <span className="rounded border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-300 dark:border-gray-700 dark:text-gray-600">
                  Próxima →
                </span>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}

const CORES_TEXTO: Record<"verde" | "amarelo" | "vermelho" | "neutro", string> = {
  verde: "text-green-600 dark:text-green-400",
  amarelo: "text-amber-600 dark:text-amber-400",
  vermelho: "text-red-600 dark:text-red-400",
  neutro: "text-gray-900 dark:text-gray-100",
};
