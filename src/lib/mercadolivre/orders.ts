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
  compradorId: number | null;
  produto: string;
  packId: string;
  contaId: string;
  contaNickname: string;
  // Fase 5: soma do sale_fee (comissao do Mercado Livre) de cada item do
  // pedido, ja vinda do proprio /orders/search -- sem chamada extra a API.
  // Precisa verificacao ao vivo: o campo sale_fee normalmente vem por item
  // ja como valor total daquele item (nao por unidade), mas isso pode variar
  // por categoria/conta -- conferir contra o extrato oficial do ML antes de
  // confiar 100% neste numero em decisao financeira.
  taxaPlataforma: number;
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
  pack_id?: number | null;
  buyer?: { nickname?: string; id?: number; first_name?: string; last_name?: string };
  order_items?: { item?: { id?: string; title?: string }; quantity?: number; sale_fee?: number; unit_price?: number }[];
};

export type ProdutoRanking = {
  itemId: string;
  titulo: string;
  quantidade: number;
  valor: number;
};

// Monta o nome de exibicao do comprador: prefere nome completo (first_name +
// last_name) quando a API devolve esse dado, caindo para o nickname quando
// nao devolve. O Mercado Livre restringe dados pessoais do comprador por
// LGPD em alguns casos (ex: apos uma janela de tempo da entrega) -- por
// isso o fallback para nickname (ou "-") e obrigatorio, nao cosmetico.
function nomeComprador(buyer: PedidoApi["buyer"]): string {
  const nomeCompleto = [buyer?.first_name, buyer?.last_name].filter(Boolean).join(" ").trim();
  if (nomeCompleto) return nomeCompleto;
  return buyer?.nickname ?? "—";
}

function somarTaxaPlataforma(itens: PedidoApi["order_items"]): number {
  return (itens ?? []).reduce((soma, oi) => soma + (oi.sale_fee ?? 0), 0);
}

// Busca TODOS os pedidos pagos de uma conta dentro do periodo informado,
// paginando ate cobrir o total (ou ate o teto pratico da API). Retorna a
// lista de pedidos (para extrato/tabela), os totais consolidados, e (Fase 5)
// um ranking de produtos vendidos por item -- calculado a partir dos MESMOS
// pedidos ja buscados aqui, sem nenhuma chamada extra a API.
export async function getVendas(
  accessToken: string,
  mlUserId: number,
  periodo: PeriodoISO,
  contaId: string,
  contaNickname: string
): Promise<{
  pedidos: Pedido[];
  totalPedidos: number;
  valorSomado: number;
  unidadesVendidas: number;
  cortado: boolean;
  moeda: string | null;
  porProduto: ProdutoRanking[];
}> {
  let offset = 0;
  let totalNaApi = 0;
  let unidadesVendidas = 0;
  const pedidos: Pedido[] = [];
  const porProdutoMapa = new Map<string, ProdutoRanking>();

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
      // Soma as unidades (quantity) de cada item do pedido -- usado pelo card
      // "Unidades vendidas" por conta em Vendas. Sofre a mesma limitação de
      // amostra parcial que valorSomado quando o periodo excede TETO_PEDIDOS
      // (ver flag "cortado" abaixo).
      unidadesVendidas += (p.order_items ?? []).reduce((soma, oi) => soma + (oi.quantity ?? 0), 0);

      // Fase 5: agrega por item (mesmo criterio de getProdutosMaisVendidos)
      // aproveitando o loop que ja esta rodando aqui -- alimenta a sessao
      // "Mais vendidos por SKU" de Vendas sem nenhuma chamada extra.
      for (const oi of p.order_items ?? []) {
        const itemId = oi.item?.id ?? "sem-id";
        const titulo = oi.item?.title ?? "Produto sem título";
        const quantidade = oi.quantity ?? 0;
        const valorItem = (oi.unit_price ?? 0) * quantidade;
        const atual = porProdutoMapa.get(itemId);
        if (atual) {
          atual.quantidade += quantidade;
          atual.valor += valorItem;
        } else {
          porProdutoMapa.set(itemId, { itemId, titulo, quantidade, valor: valorItem });
        }
      }

      pedidos.push({
        id: p.id,
        dataCriacao: p.date_created,
        status: p.status,
        // Faturamento do dashboard = total_amount (valor dos produtos vendidos),
        // sem somar o frete pago pelo comprador. paid_amount inclui esse frete
        // quando o comprador paga algo adicional por ele, por isso NAO usamos
        // paid_amount aqui -- mesmo que isso gere um valor diferente do que a
        // propria plataforma do Mercado Livre chama de "Vendas brutas" (que
        // conta o frete pago pelo comprador). Decisao explicita do usuario.
        valor: p.total_amount ?? 0,
        moeda: p.currency_id,
        comprador: nomeComprador(p.buyer),
        compradorId: p.buyer?.id ?? null,
        produto: p.order_items?.[0]?.item?.title
          ? p.order_items.length > 1
            ? `${p.order_items[0].item?.title} +${p.order_items.length - 1}`
            : p.order_items[0].item?.title ?? "—"
          : "—",
        packId: p.pack_id ? String(p.pack_id) : String(p.id),
        contaId,
        contaNickname,
        taxaPlataforma: somarTaxaPlataforma(p.order_items),
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
    unidadesVendidas,
    cortado: totalNaApi > pedidos.length,
    moeda,
    porProduto: Array.from(porProdutoMapa.values()).sort((a, b) => b.quantidade - a.quantidade),
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
      // Faturamento do dashboard = total_amount (valor dos produtos), tanto para
      // pedidos pagos quanto cancelados -- nao soma o frete pago pelo comprador
      // (paid_amount incluiria esse frete). Decisao explicita do usuario: o valor
      // aqui pode divergir do "Vendas brutas" que a propria plataforma do Mercado
      // Livre exibe (que conta o frete pago pelo comprador).
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

export type ClassificacaoCancelados = {
  canceladosPuros: { quantidade: number; valor: number };
  devolvidos: { quantidade: number; valor: number };
  moeda: string | null;
};

// Classifica os pedidos CANCELADOS do periodo em duas categorias, no mesmo
// criterio que o proprio painel do vendedor do Mercado Livre usa (descoberto
// testando ao vivo em 27/07/2026, comparando pedido a pedido com o que o
// usuario via na plataforma):
// - "Cancelados": pedido cancelado sem que um envio tenha sido despachado
// (sem registro de shipment, ou o registro nunca saiu do vendedor).
// - "Devolvidos": pedido cujo envio chegou a ser despachado mas nao foi
// entregue e voltou ao remetente (shipment.status === "not_delivered" --
// cobre substatus como "returned", "stolen", "lost", etc).
export async function getCanceladosClassificados(
  accessToken: string,
  mlUserId: number,
  periodo: PeriodoISO
): Promise<ClassificacaoCancelados> {
  let offset = 0;
  let totalNaApi = 0;
  const pedidos: { id: number; valor: number }[] = [];
  let moeda: string | null = null;

  while (true) {
    const params = new URLSearchParams({
      seller: String(mlUserId),
      "order.status": "cancelled",
      "order.date_created.from": periodo.desde,
      "order.date_created.to": periodo.ate,
      limit: String(LIMITE_POR_PAGINA),
      offset: String(offset),
    });
    const res = await fetch(`${ML_API}/orders/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Falha ao buscar cancelados: ${res.status}`);
    const data = (await res.json()) as { paging: { total: number }; results: PedidoApi[] };
    totalNaApi = data.paging.total;
    for (const p of data.results) {
      pedidos.push({ id: p.id, valor: p.total_amount ?? 0 });
      if (!moeda) moeda = p.currency_id;
    }
    offset += LIMITE_POR_PAGINA;
    if (offset >= totalNaApi || data.results.length === 0) break;
  }

  let canceladosPuros = { quantidade: 0, valor: 0 };
  let devolvidos = { quantidade: 0, valor: 0 };

  const classificacoes = await Promise.all(
    pedidos.map(async (p) => {
      try {
        const envio = await getEnvioPedido(accessToken, p.id);
        const foiDevolvido = envio?.status === "not_delivered";
        return { valor: p.valor, foiDevolvido };
      } catch {
        return { valor: p.valor, foiDevolvido: false };
      }
    })
  );

  for (const c of classificacoes) {
    if (c.foiDevolvido) {
      devolvidos = { quantidade: devolvidos.quantidade + 1, valor: devolvidos.valor + c.valor };
    } else {
      canceladosPuros = { quantidade: canceladosPuros.quantidade + 1, valor: canceladosPuros.valor + c.valor };
    }
  }

  return { canceladosPuros, devolvidos, moeda };
}

type PedidoApiCompleto = PedidoApi & {
  order_items?: {
    item?: { id?: string; title?: string };
    quantity?: number;
    unit_price?: number;
  }[];
};

// Agrega os itens vendidos (pedidos pagos) no periodo, somando quantidade e
// valor por produto, para montar o ranking de produtos mais vendidos.
// Mantida para o Resumo (que nao busca a lista completa de pedidos, so
// totais); em Vendas, prefira o campo "porProduto" que ja vem de getVendas
// (evita duplicar a mesma busca de pedidos).
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
  // Fase 5 -- campos adicionados para o extrato enriquecido e a sessao de
  // Metricas de Vendas. IMPORTANTE: os nomes exatos desses campos no recurso
  // de shipment do ML (estimated_delivery_time, receiver_address, custo do
  // envio) precisam ser confirmados ao vivo com um pedido real -- o codigo
  // abaixo tenta os caminhos mais comuns da documentacao, com fallback para
  // null quando o campo nao existe, para nunca quebrar a pagina por causa
  // disso (so deixa de mostrar aquele dado especifico).
  previsaoEntrega: string | null;
  estado: string | null;
  cidade: string | null;
  custoFrete: number | null;
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
    shipping_option?: { estimated_delivery_time?: { date?: string } | null; cost?: number } | null;
    estimated_delivery_time?: { date?: string } | null;
    receiver_address?: { state?: { name?: string } | null; city?: { name?: string } | null } | null;
  };

  // Custo do envio: tenta o endpoint dedicado de custos primeiro (mais
  // confiavel para o valor efetivamente debitado do vendedor); se falhar
  // (conta sem permissao, formato diferente, etc.), cai para o campo de
  // custo que pode vir embutido no proprio shipment.
  let custoFrete: number | null = s.shipping_option?.cost ?? null;
  try {
    const resCustos = await fetch(`${ML_API}/shipments/${s.id}/costs`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (resCustos.ok) {
      const custos = (await resCustos.json()) as { senders?: { cost?: number }[] };
      const custoSenders = custos.senders?.[0]?.cost;
      if (typeof custoSenders === "number") custoFrete = custoSenders;
    }
  } catch {
    // mantem o valor de shipping_option?.cost (ou null) buscado acima
  }

  return {
    shipmentId: s.id,
    modo: s.mode,
    status: s.status,
    substatus: s.substatus,
    trackingNumber: s.tracking_number,
    trackingUrl: s.tracking_url ?? null,
    previsaoEntrega: s.estimated_delivery_time?.date ?? s.shipping_option?.estimated_delivery_time?.date ?? null,
    estado: s.receiver_address?.state?.name ?? null,
    cidade: s.receiver_address?.city?.name ?? null,
    custoFrete,
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
    // total_amount (sem frete pago pelo comprador) -- mesma definicao usada
    // em getVendas/getTotaisPorStatus.
    atual.valor += p.total_amount ?? 0;
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

// --- Fase 5: Metricas de Vendas (horario de compra + geolocalizacao) ---

export type PontoHorario = { hora: number; quantidade: number };

// Distribuicao de pedidos por hora do dia (0-23), a partir da lista de
// pedidos ja buscada (dataCriacao) -- NAO faz nenhuma chamada extra a API,
// reaproveita os dados de getVendas.
export function agruparPorHorario(pedidos: { dataCriacao: string }[]): PontoHorario[] {
  const contagem = new Array(24).fill(0);
  for (const p of pedidos) {
    // O ISO ja vem com o offset do vendedor embutido (geralmente -03:00),
    // entao extraimos a hora direto da string em vez de usar
    // Date.getHours() (que converteria para o fuso do servidor, UTC na
    // Vercel, dando a hora errada). Mesmo cuidado ja usado em diaBrasilia
    // acima para o dia.
    const match = p.dataCriacao.match(/T(\d{2}):/);
    const hora = match ? Number(match[1]) : new Date(p.dataCriacao).getUTCHours();
    contagem[hora]++;
  }
  return contagem.map((quantidade, hora) => ({ hora, quantidade }));
}

export type PontoEstado = { estado: string; quantidade: number };

// Teto de chamadas de shipment por carregamento para o agregado de estado --
// o endereco do comprador NAO vem no /orders/search, exige 1 chamada de
// shipment por pedido (mesmo endpoint usado em getEnvioPedido). Isso e bem
// mais caro que o resto das metricas de Vendas (que reaproveitam dados ja
// buscados) -- por isso o teto e o aviso de amostra parcial abaixo.
const TETO_ENDERECOS = 150;

// Agrega pedidos por estado do endereco de entrega. Quando o periodo tem mais
// pedidos que TETO_ENDERECOS, o resultado e uma amostra dos pedidos mais
// recentes (nao o total exato) -- sinalizado em amostraParcial, no mesmo
// espirito do "cortado"/"amostraParcial" ja usado em Vendas/Faturamento.
export async function getVendasPorEstado(
  accessToken: string,
  pedidos: { id: number }[]
): Promise<{ porEstado: PontoEstado[]; amostraParcial: boolean; amostraTamanho: number }> {
  const amostra = pedidos.slice(0, TETO_ENDERECOS);
  const contagem = new Map<string, number>();

  await Promise.all(
    amostra.map(async (p) => {
      try {
        const envio = await getEnvioPedido(accessToken, p.id);
        const estado = envio?.estado ?? "Não informado";
        contagem.set(estado, (contagem.get(estado) ?? 0) + 1);
      } catch {
        // um pedido sem endereco/erro pontual nao deve derrubar o agregado inteiro
      }
    })
  );

  const porEstado = Array.from(contagem.entries())
    .map(([estado, quantidade]) => ({ estado, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);

  return { porEstado, amostraParcial: pedidos.length > TETO_ENDERECOS, amostraTamanho: amostra.length };
}
