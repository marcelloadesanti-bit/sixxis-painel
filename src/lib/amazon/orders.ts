// Consulta de pedidos/vendas na Selling Partner API (Amazon).
// Docs: developer-docs.amazon.com/sp-api/docs/orders-api-v0-reference
//
// Diferenca importante em relacao ao Mercado Livre: a Orders API da Amazon
// tem um rate limit MUITO mais restritivo (por padrao cerca de 1
// requisicao por minuto sustentada, com um "estouro" (burst) de ate 20
// chamadas seguidas). Por isso, paginamos com uma pequena pausa entre
// chamadas e evitamos buscar o detalhe item-a-item de cada pedido
// (GetOrderItems), que exigiria uma chamada extra por pedido e estouraria
// o limite rapido. Por esse motivo, o extrato de vendas da Amazon (v1) nao
// traz nome do produto nem do comprador -- a API tambem so libera esses
// dados com a funcao restrita de PII, que ficou de fora do escopo do app
// (decisao explicita: so vendas e faturamento agregados).
//
// Regiao do endpoint: "na" (America do Norte) cobre o marketplace do
// Brasil (A2Q3Y263D00KWC), que e o unico habilitado por enquanto.

const SPAPI_BASE = "https://sellingpartnerapi-na.amazon.com";

export type PedidoAmazon = {
  id: string;
  dataCriacao: string;
  status: string;
  valor: number;
  moeda: string;
  comprador: string;
  produto: string;
  contaId: string;
  contaNickname: string;
};

export type PeriodoISO = {
  desde: string; // ISO 8601 completo, ex: 2026-07-01T00:00:00.000-03:00
  ate: string;
};

// Converte um intervalo de datas simples (YYYY-MM-DD) para o formato ISO
// com o fuso de Brasilia, cobrindo o dia inteiro -- mesma convencao usada
// no periodoDeDatas do Mercado Livre, para os filtros de periodo baterem
// entre as duas plataformas.
//
// Diferenca importante em relacao ao ML: a SP-API exige que CreatedBefore
// (Orders) e PostedBefore (Finances) sejam SEMPRE no minimo 2 minutos no
// passado em relacao ao horario da requisicao -- passar um "ate" que caia
// no futuro (ex: hoje as 23:59:59, quando ainda sao 10h da manha) faz a
// Amazon recusar a chamada inteira com HTTP 400. Por isso, sempre que o fim
// do periodo pedido cair depois de "agora - 3min", usamos esse limite
// seguro no lugar do fim do dia.
export function periodoDeDatas(de: string, ate: string): PeriodoISO {
  const fimDoDia = new Date(`${ate}T23:59:59.999-03:00`);
  const limiteSeguro = new Date(Date.now() - 3 * 60 * 1000);
  const ateFinal = fimDoDia.getTime() > limiteSeguro.getTime() ? limiteSeguro : fimDoDia;

  return {
    desde: `${de}T00:00:00.000-03:00`,
    ate: ateFinal.toISOString(),
  };
}

const STATUS_CANCELADO = "Canceled";

type OrderApi = {
  AmazonOrderId: string;
  PurchaseDate: string;
  OrderStatus: string;
  OrderTotal?: { CurrencyCode: string; Amount: string };
  NumberOfItemsShipped?: number;
  NumberOfItemsUnshipped?: number;
};

type OrdersResponse = {
  payload: {
    Orders: OrderApi[];
    NextToken?: string;
  };
};

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function buscarPaginaOrders(
  accessToken: string,
  marketplaceId: string,
  periodo: PeriodoISO,
  nextToken: string | undefined,
  tentativa = 0
): Promise<OrdersResponse> {
  const params = new URLSearchParams(
    nextToken
      ? { MarketplaceIds: marketplaceId, NextToken: nextToken }
      : {
          MarketplaceIds: marketplaceId,
          CreatedAfter: periodo.desde,
          CreatedBefore: periodo.ate,
        }
  );

  const res = await fetch(`${SPAPI_BASE}/orders/v0/orders?${params.toString()}`, {
    headers: { "x-amz-access-token": accessToken },
  });

  if (res.status === 429 && tentativa < 3) {
    // Rate limit da SP-API: espera com backoff crescente e tenta de novo.
    await aguardar(3000 * (tentativa + 1));
    return buscarPaginaOrders(accessToken, marketplaceId, periodo, nextToken, tentativa + 1);
  }

  if (!res.ok) {
    throw new Error(`Falha ao buscar pedidos Amazon: ${res.status}`);
  }

  return res.json() as Promise<OrdersResponse>;
}

// Busca todos os pedidos (qualquer status, mesmo criterio de "vendas
// brutas" ja usado no Mercado Livre: pagos + cancelados) de uma conta
// Amazon dentro do periodo informado.
export async function getVendas(
  accessToken: string,
  marketplaceId: string,
  periodo: PeriodoISO,
  contaId: string,
  contaNickname: string
): Promise<{
  pedidos: PedidoAmazon[];
  totalPedidos: number;
  valorSomado: number;
  unidadesVendidas: number;
  cortado: boolean;
  moeda: string | null;
}> {
  const pedidos: PedidoAmazon[] = [];
  let unidadesVendidas = 0;
  let nextToken: string | undefined;
  let primeira = true;

  do {
    if (!primeira) {
      // Respeita o rate limit sustentado da Orders API entre paginas.
      await aguardar(1100);
    }
    primeira = false;

    const data = await buscarPaginaOrders(accessToken, marketplaceId, periodo, nextToken);

    for (const o of data.payload.Orders ?? []) {
      unidadesVendidas += (o.NumberOfItemsShipped ?? 0) + (o.NumberOfItemsUnshipped ?? 0);
      pedidos.push({
        id: o.AmazonOrderId,
        dataCriacao: o.PurchaseDate,
        status: o.OrderStatus,
        valor: o.OrderTotal ? Number(o.OrderTotal.Amount) : 0,
        moeda: o.OrderTotal?.CurrencyCode ?? "BRL",
        comprador: "—",
        produto: "—",
        contaId,
        contaNickname,
      });
    }

    nextToken = data.payload.NextToken;
  } while (nextToken);

  const valorSomado = pedidos.reduce((soma, p) => soma + p.valor, 0);
  const moeda = pedidos[0]?.moeda ?? null;

  return {
    pedidos,
    totalPedidos: pedidos.length,
    valorSomado,
    unidadesVendidas,
    cortado: false, // a Orders API pagina ate o fim via NextToken, sem teto artificial
    moeda,
  };
}

export type ClassificacaoCanceladosAmazon = {
  quantidade: number;
  valor: number;
};

// Classificacao simples de cancelados a partir de uma lista de pedidos ja
// buscada (sem chamada extra a API). Nao ha, por enquanto, a granularidade
// de "devolvidos" que o Mercado Livre tem via status de envio -- fora do
// escopo definido para a Amazon nesta fase (so vendas e faturamento).
export function classificarCancelados(pedidos: PedidoAmazon[]): ClassificacaoCanceladosAmazon {
  const cancelados = pedidos.filter((p) => p.status === STATUS_CANCELADO);
  return {
    quantidade: cancelados.length,
    valor: cancelados.reduce((soma, p) => soma + p.valor, 0),
  };
}
