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
  paid_amount?: number;
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
        // paid_amount = total_amount + frete pago pelo comprador; e o que a
        // plataforma do Mercado Livre chama de "Vendas brutas".
        valor: p.paid_amount ?? p.total_amount ?? 0,
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
      // Para pedidos pagos, "paid_amount" e o valor real recebido (produto + frete),
      // que e o que a plataforma chama de "Vendas brutas". Ja para pedidos cancelados
      // o paid_amount vem zerado (nada foi efetivamente recebido), entao usamos o
      // total_amount (valor da venda que foi cancelada) para bater com o "Valor de
      // vendas canceladas" do painel do Mercado Livre.
      valor += status === "paid" ? p.paid_amount ?? p.total_amount ?? 0 : p.total_amount ?? 0;
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

export type ProdutoRanking = {
  itemId: string;
  titulo: string;
  quantidade: number;
  valor: number;
};

type PedidoApiCompleto = PedidoApi & {
  order_items?: {
    item?: { id?: string; title?: string };
    quantity?: number;
    unit_price?: number;
  }[];
};

// Agrega os itens vendidos (pedidos pagos) no periodo, somando quantidade e
// valor por produto, para montar o ranking de produtos mais vendidos.
export async function getProdutosMaisVendidos(
  accessToken: string,
  mlUserId: number,
  periodo: PeriodoISO
): Promise<ProdutoRanking[]> {
  let offset = 0;
  let totalNaApi = 0;
  const porProduto = new Map<string, ProdutoRanking>();

  while (true) {
    const params = new URLSearchParams({
      seller: String(mlUserId),
      "order.status": "paid",
      "order.date_created.from": periodo.desde,
      "order.date_created.to": periodo.ate,
      limit: String(LIMITE_POR_PAGINA),
      offset: String(offset),
    });

    const res = await fetch(`${ML_API}/orders/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Falha ao buscar produtos vendidos: ${res.status}`);
    }

    const data = (await res.json()) as { paging: { total: number }; results: PedidoApiCompleto[] };
    totalNaApi = data.paging.total;

    for (const pedido of data.results) {
      for (const oi of pedido.order_items ?? []) {
        const id = oi.item?.id ?? "sem-id";
        const titulo = oi.item?.title ?? "Produto sem título";
        const quantidade = oi.quantity ?? 0;
        const valor = (oi.unit_price ?? 0) * quantidade;

        const atual = porProduto.get(id);
        if (atual) {
          atual.quantidade += quantidade;
          atual.valor += valor;
        } else {
          porProduto.set(id, { itemId: id, titulo, quantidade, valor });
        }
      }
    }

    offset += LIMITE_POR_PAGINA;
    if (offset >= totalNaApi || offset >= TETO_PEDIDOS || data.results.length === 0) {
      break;
    }
  }

  return Array.from(porProduto.values()).sort((a, b) => b.quantidade - a.quantidade);
}

// --- Detalhe de um pedido especifico + envio (para a pagina de detalhe/acoes) ---

export type PedidoDetalhe = {
  id: number;
  status: string;
  dataCriacao: string;
  packId: string | null;
  totalPago: number;
  moeda: string;
  comprador: { id: number; nickname: string } | null;
  itens: { titulo: string; quantidade: number; precoUnitario: number }[];
};

export async function getPedidoDetalhe(accessToken: string, orderId: number): Promise<PedidoDetalhe> {
  const res = await fetch(`${ML_API}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Falha ao buscar pedido ${orderId}: ${res.status}`);

  const o = (await res.json()) as {
    id: number;
    status: string;
    date_created: string;
    pack_id: number | null;
    total_amount: number;
    paid_amount?: number;
    currency_id: string;
    buyer?: { id: number; nickname: string };
    order_items?: { item: { title: string }; quantity: number; unit_price: number }[];
  };

  return {
    id: o.id,
    status: o.status,
    dataCriacao: o.date_created,
    // Se pack_id vier nulo, a doc do ML orienta usar o order_id no lugar,
    // mantendo o recurso /packs na chamada (pedidos sem carrinho compartilhado).
    packId: o.pack_id ? String(o.pack_id) : String(o.id),
    totalPago: o.paid_amount ?? o.total_amount ?? 0,
    moeda: o.currency_id,
    comprador: o.buyer ? { id: o.buyer.id, nickname: o.buyer.nickname } : null,
    itens: (o.order_items ?? []).map((i) => ({
      titulo: i.item.title,
      quantidade: i.quantity,
      precoUnitario: i.unit_price,
    })),
  };
}

export type EnvioPedido = {
  shipmentId: number;
  modo: string;
  status: string;
  substatus: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
};

export async function getEnvioPedido(accessToken: string, orderId: number): Promise<EnvioPedido | null> {
  const res = await fetch(`${ML_API}/orders/${orderId}/shipments`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Falha ao buscar envio do pedido ${orderId}: ${res.status}`);

  const s = (await res.json()) as {
    id: number;
    mode: string;
    status: string;
    substatus: string | null;
    tracking_number: string | null;
    tracking_url?: string | null;
  };

  return {
    shipmentId: s.id,
    modo: s.mode,
    status: s.status,
    substatus: s.substatus,
    trackingNumber: s.tracking_number,
    trackingUrl: s.tracking_url ?? null,
  };
}

// Atualiza status de envio ME1 (autogerenciado). Nao se aplica a envios ME2
// (logistica gerenciada pelo Mercado Livre), que sao atualizados pela
// transportadora automaticamente.
export async function notificarStatusEnvioME1(
  accessToken: string,
  shipmentId: number,
  status: "shipped" | "not_delivered" | "delivered",
  substatus: string | null,
  comentario: string
): Promise<void> {
  const res = await fetch(`${ML_API}/shipments/${shipmentId}/seller_notifications`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payload: { comment: comentario, date: new Date().toISOString() },
      status,
      substatus,
    }),
  });
  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`Falha ao notificar status do envio ${shipmentId}: ${res.status} ${corpo}`);
  }
}


export type PontoSerieDiaria = { data: string; quantidade: number; valor: number };

// Serie diaria de "vendas brutas" (pagos + cancelados, mesma definicao usada
// no Resumo) para alimentar o grafico comparativo. Busca a lista completa de
// pedidos (pagos e cancelados) do periodo e agrupa por dia (data de criacao,
// no fuso de Brasilia, ja que periodo.desde/ate vem com offset -03:00).
export async function getSerieDiariaVendas(
  accessToken: string,
  mlUserId: number,
  periodo: PeriodoISO
): Promise<PontoSerieDiaria[]> {
  async function buscarStatus(status: "paid" | "cancelled"): Promise<PedidoApi[]> {
    const pedidos: PedidoApi[] = [];
    let offset = 0;
    let total = 0;
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
      if (!res.ok) throw new Error(`Falha ao buscar serie diaria (${status}): ${res.status}`);
      const data = (await res.json()) as { paging: { total: number }; results: PedidoApi[] };
      total = data.paging.total;
      pedidos.push(...data.results);
      offset += LIMITE_POR_PAGINA;
      if (offset >= total || offset >= TETO_PEDIDOS || data.results.length === 0) break;
    }
    return pedidos;
  }

  const [pagos, cancelados] = await Promise.all([buscarStatus("paid"), buscarStatus("cancelled")]);

  const porDia = new Map<string, { quantidade: number; valor: number }>();

  function diaBrasilia(iso: string): string {
    // date_created vem com o offset do vendedor (geralmente -03:00 ja
    // embutido); pegamos so a parte YYYY-MM-DD, que e o que importa para
    // agrupar por dia no grafico.
    return iso.slice(0, 10);
  }

  for (const p of pagos) {
    const dia = diaBrasilia(p.date_created);
    const atual = porDia.get(dia) ?? { quantidade: 0, valor: 0 };
    atual.quantidade += 1;
    atual.valor += p.paid_amount ?? p.total_amount ?? 0;
    porDia.set(dia, atual);
  }
  for (const p of cancelados) {
    const dia = diaBrasilia(p.date_created);
    const atual = porDia.get(dia) ?? { quantidade: 0, valor: 0 };
    atual.quantidade += 1;
    atual.valor += p.total_amount ?? 0;
    porDia.set(dia, atual);
  }

  return Array.from(porDia.entries())
    .map(([data, v]) => ({ data, quantidade: v.quantidade, valor: Math.round(v.valor * 100) / 100 }))
    .sort((a, b) => a.data.localeCompare(b.data));
}
