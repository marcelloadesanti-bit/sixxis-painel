// Consulta de pedidos/vendas na API do Mercado Livre.
// Docs: developers.mercadolibre.com.br/pt_br/gestao-de-vendas

const ML_API = "https://api.mercadolibre.com";
const LIMITE_POR_PAGINA = 50;
const TETO_PEDIDOS = 1000; // limite pratico de offset da API de busca do ML

export type Pedido = {
  id: number;
  dataCriacao: string;
  status: string;
  valor: number;
  moeda: string;
  comprador: string;
  produto: string;
  contaId: string;
  contaNickname: string;
};

export type ResumoVendas = {
  totalPedidos: number;
  valorSomado: number;
  amostraParcial: boolean;
  moeda: string | null;
};

export type PeriodoISO = {
  desde: string; // ISO 8601 completo, ex: 2026-07-01T00:00:00.000-03:00
  ate: string;
};

// Converte um intervalo de datas simples (YYYY-MM-DD) para o formato
// ISO com o fuso de Brasilia, cobrindo o dia inteiro (00:00:00 a 23:59:59).
// Isso alinha o filtro com o que aparece no painel do vendedor do
// Mercado Livre (que usa o horario de Brasilia).
export function periodoDeDatas(de: string, ate: string): PeriodoISO {
  return {
    desde: `${de}T00:00:00.000-03:00`,
    ate: `${ate}T23:59:59.999-03:00`,
  };
}

type PedidoApi = {
  id: number;
  date_created: string;
  status: string;
  total_amount: number;
  currency_id: string;
  buyer?: { nickname?: string };
  order_items?: { item?: { title?: string }; quantity?: number }[];
};

// Busca TODOS os pedidos pagos de uma conta dentro do periodo informado,
// paginando ate cobrir o total (ou ate o teto pratico da API). Retorna a
// lista de pedidos (para extrato/tabela) e os totais consolidados.
export async function getVendas(
  accessToken: string,
  mlUserId: number,
  periodo: PeriodoISO,
  contaId: string,
  contaNickname: string
): Promise<{ pedidos: Pedido[]; totalPedidos: number; valorSomado: number; cortado: boolean; moeda: string | null }> {
  let offset = 0;
  let totalNaApi = 0;
  const pedidos: Pedido[] = [];

  while (true) {
    const params = new URLSearchParams({
      seller: String(mlUserId),
      "order.status": "paid",
      "order.date_created.from": periodo.desde,
      "order.date_created.to": periodo.ate,
      sort: "date_desc",
      limit: String(LIMITE_POR_PAGINA),
      offset: String(offset),
    });

    const res = await fetch(`${ML_API}/orders/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Falha ao buscar pedidos: ${res.status}`);
    }

    const data = (await res.json()) as { paging: { total: number }; results: PedidoApi[] };
    totalNaApi = data.paging.total;

    for (const p of data.results) {
      pedidos.push({
        id: p.id,
        dataCriacao: p.date_created,
        status: p.status,
        valor: p.total_amount ?? 0,
        moeda: p.currency_id,
        comprador: p.buyer?.nickname ?? "—",
        produto: p.order_items?.[0]?.item?.title
          ? p.order_items.length > 1
            ? `${p.order_items[0].item?.title} +${p.order_items.length - 1}`
            : p.order_items[0].item?.title ?? "—"
          : "—",
        contaId,
        contaNickname,
      });
    }

    offset += LIMITE_POR_PAGINA;
    if (offset >= totalNaApi || offset >= TETO_PEDIDOS || data.results.length === 0) {
      break;
    }
  }

  const valorSomado = pedidos.reduce((soma, p) => soma + p.valor, 0);
  const moeda = pedidos[0]?.moeda ?? null;

  return {
    pedidos,
    totalPedidos: totalNaApi,
    valorSomado,
    cortado: totalNaApi > pedidos.length,
    moeda,
  };
}

// Atalho usado no dashboard resumido: pedidos pagos dos ultimos `dias` dias.
export async function getResumoVendas(
  accessToken: string,
  mlUserId: number,
  { dias = 30 }: { dias?: number } = {}
): Promise<ResumoVendas> {
  const hoje = new Date();
  const inicio = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
  const periodo: PeriodoISO = {
    desde: inicio.toISOString(),
    ate: hoje.toISOString(),
  };

  const { totalPedidos, valorSomado, cortado, moeda } = await getVendas(
    accessToken,
    mlUserId,
    periodo,
    "",
    ""
  );

  return { totalPedidos, valorSomado, amostraParcial: cortado, moeda };
}

// Versao leve de getVendas: soma quantidade e valor de pedidos por status,
// sem montar a lista detalhada de pedidos (usado nos cards de metricas).
export async function getTotaisPorStatus(
  accessToken: string,
  mlUserId: number,
  periodo: PeriodoISO,
  status: "paid" | "cancelled"
): Promise<{ quantidade: number; valor: number; moeda: string | null }> {
  let offset = 0;
  let totalNaApi = 0;
  let quantidadeContada = 0;
  let valor = 0;
  let moeda: string | null = null;

  while (true) {
    const params = new URLSearchParams({
      seller: String(mlUserId),
      "order.status": status,
      "order.date_created.from": periodo.desde,
      "order.date_created.to": periodo.ate,
      limit: String(LIMITE_POR_PAGINA),
      offset: String(offset),
    });

    const res = await fetch(`${ML_API}/orders/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Falha ao buscar pedidos (${status}): ${res.status}`);
    }

    const data = (await res.json()) as { paging: { total: number }; results: PedidoApi[] };
    totalNaApi = data.paging.total;

    for (const p of data.results) {
      valor += p.total_amount ?? 0;
      if (!moeda) moeda = p.currency_id;
      quantidadeContada++;
    }

    offset += LIMITE_POR_PAGINA;
    if (offset >= totalNaApi || offset >= TETO_PEDIDOS || data.results.length === 0) {
      break;
    }
  }

  return { quantidade: totalNaApi, valor, moeda };
}
