import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import {
  getVendas,
  getCanceladosClassificados,
  getEnvioPedido,
  getVendasPorEstado,
  agruparPorHorario,
  periodoDeDatas,
  type Pedido,
} from "@/lib/mercadolivre/orders";
import { getMaisVendidosPorSku, type RankingSku } from "@/lib/mercadolivre/items";
import { getTotalVisitas } from "@/lib/mercadolivre/visits";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import VendasPorConta, { type ContaVendas } from "./vendas-por-conta";
import ExtratoLinha, { type LinhaExtrato } from "./extrato-linha";

// 27/07/2026: com as novas metricas por conta (visitas, cancelados,
// devolucoes), o carregamento da pagina passou a fazer bem mais chamadas a
// API do ML por conta do que antes (principalmente devolucoes, que verifica
// reclamacao por reclamacao). Aumenta o timeout padrao da Vercel (Hobby)
// para dar folga -- mesma licao aprendida em Faturamento.
//
// Fase 5 (30/07/2026): a sessao de Metricas (vendas por estado) tambem faz 1
// chamada de shipment por pedido, ate um teto global (CAP_ENDERECOS_GLOBAL
// abaixo) -- por isso o cuidado com o timeout continua valendo, e ate mais
// importante agora.
export const maxDuration = 60;

const PEDIDOS_POR_PAGINA = 15;
// Teto GLOBAL (somando todas as contas) de chamadas de shipment para o
// agregado "Vendas por estado". O endereco do comprador nao vem no
// /orders/search, exige 1 chamada por pedido -- por isso o teto, para nao
// estourar o tempo de carregamento da pagina com muitas contas/pedidos.
// Quando o periodo tem mais pedidos que isso, o card mostra um aviso de
// amostra parcial (mesma logica ja usada em "cortado"/"amostraParcial").
const CAP_ENDERECOS_GLOBAL = 120;

function formatarData(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
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

const formatarMoeda = (valor: number, moeda: string | null) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda ?? "BRL",
  }).format(valor);

const formatarNumero = (n: number) => n.toLocaleString("pt-BR");

const formatarDataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

// Wrapper para as metricas complementares (canceladas/visitas/devolucoes):
// se uma delas falhar (rate limit, erro pontual da API), nao derruba os
// dados de vendas (pagos) ja obtidos daquela conta -- so aquele card
// especifico mostra "-" em vez de um numero.
async function buscarSeguro<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.error("Falha ao buscar metrica complementar de vendas:", err);
    return null;
  }
}

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; conta?: string; pagina?: string }>;
}) {
  await exigirAcessoSecao("vendas");
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const hoje = new Date();
  const de = params.de ?? formatarData(primeiroDiaDoMes(hoje));
  const ate = params.ate ?? formatarData(hoje);
  const filtroConta = params.conta ?? "todas";
  const paginaSolicitada = Math.max(1, Number(params.pagina) || 1);

  const periodo = periodoDeDatas(de, ate);

  const { data: contasBase } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname, apelido, cor")
    .order("nickname", { ascending: true });

  const contasParaBuscar = (contasBase ?? []).filter(
    (c) => filtroConta === "todas" || c.id === filtroConta
  );

  const resultados = await Promise.all(
    contasParaBuscar.map(async (conta) => {
      const nome = nomeConta(conta);
      const cor = (conta.cor as string | null) ?? COR_PADRAO;
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const [vendas, canceladosClassificados, visitas] = await Promise.all([
          getVendas(accessToken, conta.ml_user_id, periodo, conta.id, nome),
          buscarSeguro(() => getCanceladosClassificados(accessToken, conta.ml_user_id, periodo)),
          buscarSeguro(() => getTotalVisitas(accessToken, conta.ml_user_id, de, ate)),
        ]);
        return {
          conta,
          nome,
          cor,
          vendas,
          canceladosClassificados,
          visitas,
          accessToken,
          erro: null as string | null,
        };
      } catch (err) {
        console.error(`Erro ao buscar vendas de ${conta.nickname}:`, err);
        return {
          conta,
          nome,
          cor,
          vendas: null,
          canceladosClassificados: null,
          visitas: null,
          accessToken: null as string | null,
          erro: "Falha ao buscar vendas desta conta.",
        };
      }
    })
  );

  // Mapa contaId -> accessToken, reaproveitado pelas sessoes novas da Fase 5
  // (enriquecimento do extrato e Metricas) sem precisar autenticar de novo.
  const tokensPorConta = new Map<string, string>();
  for (const r of resultados) {
    if (r.accessToken) tokensPorConta.set(r.conta.id, r.accessToken);
  }

  const todosPedidos: Pedido[] = resultados
    .flatMap((r) => r.vendas?.pedidos ?? [])
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime());

  const totalPedidos = resultados.reduce((soma, r) => soma + (r.vendas?.totalPedidos ?? 0), 0);
  const totalValor = resultados.reduce((soma, r) => soma + (r.vendas?.valorSomado ?? 0), 0);
  const algumCortado = resultados.some((r) => r.vendas?.cortado);
  const moeda = resultados.find((r) => r.vendas?.moeda)?.vendas?.moeda ?? "BRL";

  const totalCancelados = resultados.reduce(
    (soma, r) => soma + (r.canceladosClassificados?.canceladosPuros.quantidade ?? 0), 0
  );
  const valorCancelado = resultados.reduce(
    (soma, r) => soma + (r.canceladosClassificados?.canceladosPuros.valor ?? 0), 0
  );
  const totalDevolvidos = resultados.reduce(
    (soma, r) => soma + (r.canceladosClassificados?.devolvidos.quantidade ?? 0), 0
  );
  const valorDevolvido = resultados.reduce(
    (soma, r) => soma + (r.canceladosClassificados?.devolvidos.valor ?? 0), 0
  );

  // --- Formatacao por conta (texto ja pronto, evita mismatch de hidratacao) ---
  const contasFormatadas: ContaVendas[] = resultados.map((r) => {
    if (r.erro || !r.vendas) {
      return {
        id: r.conta.id,
        nome: r.nome,
        cor: r.cor,
        erro: r.erro ?? "Falha ao buscar vendas desta conta.",
        resumoFechado: "",
        vendasBrutasLabel: "—",
        unidadesVendidasLabel: "—",
        ticketMedioLabel: "—",
        visitasLabel: "—",
        quantidadeVendasLabel: "—",
        conversaoLabel: "—",
        canceladasLabel: "—",
        canceladasValorLabel: "",
        devolvidasLabel: "—",
        devolvidasValorLabel: "",
      };
    }

    const moedaConta = r.vendas.moeda ?? "BRL";
    const ticketMedio = r.vendas.totalPedidos > 0 ? r.vendas.valorSomado / r.vendas.totalPedidos : 0;
    const conversao = r.visitas !== null && r.visitas > 0 ? (r.vendas.totalPedidos / r.visitas) * 100 : null;
    const cc = r.canceladosClassificados;

    return {
      id: r.conta.id,
      nome: r.nome,
      cor: r.cor,
      erro: null,
      resumoFechado: `${formatarNumero(r.vendas.totalPedidos)} pedidos · ${formatarMoeda(r.vendas.valorSomado, moedaConta)}`,
      vendasBrutasLabel: formatarMoeda(r.vendas.valorSomado, moedaConta),
      unidadesVendidasLabel: formatarNumero(r.vendas.unidadesVendidas),
      ticketMedioLabel: r.vendas.totalPedidos > 0 ? formatarMoeda(ticketMedio, moedaConta) : "—",
      visitasLabel: r.visitas !== null ? formatarNumero(r.visitas) : "—",
      quantidadeVendasLabel: formatarNumero(r.vendas.totalPedidos),
      conversaoLabel: conversao !== null ? `${conversao.toFixed(2).replace(".", ",")}%` : "—",
      canceladasLabel:
        cc !== null
          ? `${formatarNumero(cc.canceladosPuros.quantidade)} pedido${cc.canceladosPuros.quantidade === 1 ? "" : "s"}`
          : "-",
      canceladasValorLabel:
        cc !== null && cc.canceladosPuros.quantidade > 0
          ? formatarMoeda(cc.canceladosPuros.valor, cc.moeda ?? moedaConta)
          : "",
      devolvidasLabel:
        cc !== null
          ? `${formatarNumero(cc.devolvidos.quantidade)} pedido${cc.devolvidos.quantidade === 1 ? "" : "s"}`
          : "-",
      devolvidasValorLabel:
        cc !== null && cc.devolvidos.quantidade > 0
          ? formatarMoeda(cc.devolvidos.valor, cc.moeda ?? moedaConta)
          : "",
    };
  });

  // --- Fase 5: sessao de Metricas (horario, estado, SKU) ---

  // Horario de compra: reaproveita todosPedidos (dataCriacao ja buscado),
  // zero chamada extra a API.
  const horario = agruparPorHorario(todosPedidos);
  const picoHorario = horario.reduce((max, h) => (h.quantidade > max.quantidade ? h : max), horario[0]);

  // Vendas por estado: precisa de 1 chamada de shipment por pedido (o
  // endereco nao vem no /orders/search). Limitado a CAP_ENDERECOS_GLOBAL
  // pedidos no total (nao por conta), pegando os mais recentes primeiro.
  const amostraEndereco = todosPedidos.slice(0, CAP_ENDERECOS_GLOBAL);
  const pedidosPorContaAmostra = new Map<string, { id: number }[]>();
  for (const p of amostraEndereco) {
    if (!pedidosPorContaAmostra.has(p.contaId)) pedidosPorContaAmostra.set(p.contaId, []);
    pedidosPorContaAmostra.get(p.contaId)!.push({ id: p.id });
  }
  let vendasPorEstado: { estado: string; quantidade: number }[] = [];
  const estadoAmostraParcial = todosPedidos.length > CAP_ENDERECOS_GLOBAL;
  try {
    const porConta = await Promise.all(
      Array.from(pedidosPorContaAmostra.entries()).map(async ([contaId, lista]) => {
        const token = tokensPorConta.get(contaId);
        if (!token) return { porEstado: [] as { estado: string; quantidade: number }[] };
        return getVendasPorEstado(token, lista);
      })
    );
    const mapaEstado = new Map<string, number>();
    for (const r of porConta) {
      for (const e of r.porEstado) mapaEstado.set(e.estado, (mapaEstado.get(e.estado) ?? 0) + e.quantidade);
    }
    vendasPorEstado = Array.from(mapaEstado.entries())
      .map(([estado, quantidade]) => ({ estado, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 10);
  } catch (err) {
    console.error("Erro ao agregar vendas por estado:", err);
  }

  // Mais vendidos por SKU: junta o "porProduto" que ja vem de graca de
  // getVendas (mesmos pedidos ja buscados). Correcao importante (30/07/2026):
  // o SKU (seller_custom_field / atributo SELLER_SKU) e um campo PRIVADO do
  // anuncio -- o Mercado Livre so retorna esse campo quando a consulta ao
  // item e autenticada com o token da PROPRIA conta dona daquele anuncio.
  // Por isso a busca de SKU precisa ser feita por conta (cada uma com seu
  // proprio accessToken), e so DEPOIS consolidada entre as contas -- usar um
  // unico token para itens de contas diferentes fazia o campo de SKU voltar
  // sempre vazio para os itens que nao pertenciam aquela conta.
  const rankingPorSkuPorConta = await Promise.all(
    resultados.map(async (r) => {
      if (!r.accessToken || !r.vendas?.porProduto?.length) return [] as RankingSku[];
      const produtosConta = [...r.vendas.porProduto]
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 30); // teto antes da busca de SKU, cobre folgado o catalogo pequeno do usuario
      try {
        return await getMaisVendidosPorSku(r.accessToken, produtosConta);
      } catch (err) {
        console.error(`Erro ao buscar SKU dos produtos vendidos de ${r.nome}:`, err);
        return [] as RankingSku[];
      }
    })
  );
  const porSkuConsolidado = new Map<string, RankingSku>();
  for (const lista of rankingPorSkuPorConta) {
    for (const item of lista) {
      const atual = porSkuConsolidado.get(item.sku);
      if (atual) {
        atual.quantidade += item.quantidade;
        atual.valor += item.valor;
      } else {
        porSkuConsolidado.set(item.sku, { ...item });
      }
    }
  }
  const maisVendidosPorSku: RankingSku[] = Array.from(porSkuConsolidado.values()).sort(
    (a, b) => b.quantidade - a.quantidade
  );

  // --- Paginacao do extrato (15 em 15) ---
  const totalPaginasExtrato = Math.max(1, Math.ceil(todosPedidos.length / PEDIDOS_POR_PAGINA));
  const paginaAtual = Math.min(paginaSolicitada, totalPaginasExtrato);
  const pedidosPagina = todosPedidos.slice(
    (paginaAtual - 1) * PEDIDOS_POR_PAGINA,
    paginaAtual * PEDIDOS_POR_PAGINA
  );

  // Enriquecimento do extrato (Fase 5): so os pedidos VISIVEIS nesta pagina
  // (15) recebem a chamada extra de shipment, para frete/previsao/rastreio.
  // A taxa da plataforma ja vem de graca em cada Pedido (taxaPlataforma).
  const linhasExtrato: LinhaExtrato[] = await Promise.all(
    pedidosPagina.map(async (pedido) => {
      const token = tokensPorConta.get(pedido.contaId);
      let envio: Awaited<ReturnType<typeof getEnvioPedido>> = null;
      if (token) {
        try {
          envio = await getEnvioPedido(token, pedido.id);
        } catch {
          envio = null;
        }
      }
      const contaInfo = contasParaBuscar.find((c) => c.id === pedido.contaId);
      const mlUserId = contaInfo ? Number(contaInfo.ml_user_id) : 0;
      const liquido = pedido.valor - (envio?.custoFrete ?? 0) - pedido.taxaPlataforma;

      return {
        id: pedido.id,
        dataHoraLabel: formatarDataHora(pedido.dataCriacao),
        contaId: pedido.contaId,
        contaNickname: pedido.contaNickname,
        mlUserId,
        comprador: pedido.comprador,
        compradorId: pedido.compradorId,
        produto: pedido.produto,
        vendaBrutaLabel: formatarMoeda(pedido.valor, pedido.moeda),
        freteLabel: envio?.custoFrete != null ? formatarMoeda(envio.custoFrete, pedido.moeda) : null,
        taxaLabel: formatarMoeda(pedido.taxaPlataforma, pedido.moeda),
        liquidoLabel: formatarMoeda(liquido, pedido.moeda),
        statusBadge: envio?.status ?? null,
        previsaoLabel: envio?.previsaoEntrega
          ? new Date(envio.previsaoEntrega).toLocaleDateString("pt-BR")
          : null,
        trackingUrl: envio?.trackingUrl ?? null,
        packId: pedido.packId,
      };
    })
  );

  function hrefComPagina(p: number) {
    return `/dashboard/vendas?de=${de}&ate=${ate}&conta=${filtroConta}&pagina=${p}`;
  }

  const presets: { label: string; de: string; ate: string }[] = [
    { label: "Hoje", de: formatarData(hoje), ate: formatarData(hoje) },
    {
      label: "Últimos 7 dias",
      de: formatarData(new Date(Date.now() - 6 * 86400000)),
      ate: formatarData(hoje),
    },
    {
      label: "Últimos 30 dias",
      de: formatarData(new Date(Date.now() - 29 * 86400000)),
      ate: formatarData(hoje),
    },
    { label: "Este mês", de: formatarData(primeiroDiaDoMes(hoje)), ate: formatarData(hoje) },
    {
      label: "Mês passado",
      de: formatarData(primeiroDiaDoMesAnterior(hoje)),
      ate: formatarData(ultimoDiaDoMesAnterior(hoje)),
    },
  ];

  const maxHorario = Math.max(...horario.map((h) => h.quantidade), 1);

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-[var(--color-sixxis-blue)] underline">
            ← Voltar ao painel
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">
            Vendas e faturamento
          </h1>
        </div>
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
        <button
          type="submit"
          className="rounded bg-[var(--color-sixxis-navy)] px-4 py-1.5 text-sm font-medium text-white"
        >
          Aplicar
        </button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        {presets.map((p) => {
          const ativo = p.de === de && p.ate === ate;
          return (
            <Link
              key={p.label}
              href={`/dashboard/vendas?de=${p.de}&ate=${p.ate}&conta=${filtroConta}`}
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

      <p className="mb-4 text-xs text-gray-400">
        Período: {new Date(de + "T00:00:00").toLocaleDateString("pt-BR")} até{" "}
        {new Date(ate + "T00:00:00").toLocaleDateString("pt-BR")} (horário de Brasília)
      </p>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase text-gray-400">Pedidos pagos no período</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatarNumero(totalPedidos)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase text-gray-400">Faturamento no período</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatarMoeda(totalValor, moeda)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase text-gray-400">Cancelados no período</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatarNumero(totalCancelados)}</p>
          {valorCancelado > 0 && (
            <p className="text-xs text-gray-400">{formatarMoeda(valorCancelado, moeda)}</p>
          )}
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase text-gray-400">Devolvidos no período</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatarNumero(totalDevolvidos)}</p>
          {valorDevolvido > 0 && (
            <p className="text-xs text-gray-400">{formatarMoeda(valorDevolvido, moeda)}</p>
          )}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Por conta</h2>
        <VendasPorConta contas={contasFormatadas} />
      </div>

      <div className="mb-8">
        <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Métricas</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Horário de compra</p>
            <div className="flex items-end gap-0.5" style={{ height: 60 }}>
              {horario.map((h) => (
                <div
                  key={h.hora}
                  title={`${h.hora}h: ${h.quantidade} pedido(s)`}
                  className="flex-1 rounded-t bg-[var(--color-sixxis-navy)]/70"
                  style={{ height: `${Math.max((h.quantidade / maxHorario) * 100, 2)}%` }}
                />
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              0h a 23h (fuso de Brasília) · pico às {picoHorario?.hora ?? "—"}h
            </p>
          </div>

          <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Vendas por estado</p>
            {vendasPorEstado.length === 0 ? (
              <p className="text-sm text-gray-400">Sem dados suficientes no período.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {vendasPorEstado.map((e) => (
                  <li key={e.estado} className="flex justify-between gap-2">
                    <span className="truncate text-gray-600 dark:text-gray-300">{e.estado}</span>
                    <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">{e.quantidade}</span>
                  </li>
                ))}
              </ul>
            )}
            {estadoAmostraParcial && (
              <p className="mt-2 text-xs text-amber-600">
                Amostra dos {CAP_ENDERECOS_GLOBAL} pedidos mais recentes (o período tem mais pedidos do que isso).
              </p>
            )}
          </div>

          <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Mais vendidos por SKU</p>
            {maisVendidosPorSku.length === 0 ? (
              <p className="text-sm text-gray-400">Sem dados suficientes no período.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {maisVendidosPorSku.slice(0, 8).map((s) => (
                  <li key={s.sku} className="flex justify-between gap-2">
                    <span className="truncate text-gray-600 dark:text-gray-300">{s.sku}</span>
                    <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">{s.quantidade} un.</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {algumCortado && (
        <p className="mb-4 text-xs text-amber-600">
          Período com muitos pedidos: o total de pedidos e o faturamento estão corretos, mas o
          extrato abaixo pode não listar 100% dos pedidos individuais.
        </p>
      )}

      <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Extrato de pedidos</h2>
      {todosPedidos.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          Nenhum pedido pago encontrado neste período.
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded border border-gray-200 dark:border-gray-700">
            {linhasExtrato.map((linha) => (
              <ExtratoLinha key={linha.id} linha={linha} />
            ))}
          </div>

          {totalPaginasExtrato > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              {paginaAtual > 1 ? (
                <Link
                  href={hrefComPagina(paginaAtual - 1)}
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
                Página {paginaAtual} de {totalPaginasExtrato} ({formatarNumero(todosPedidos.length)} pedidos)
              </span>
              {paginaAtual < totalPaginasExtrato ? (
                <Link
                  href={hrefComPagina(paginaAtual + 1)}
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
