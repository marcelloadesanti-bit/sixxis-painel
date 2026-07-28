// Faturamento (Finances API) da Amazon.
// Docs: developer-docs.amazon.com/sp-api/docs/finances-api-v0-reference
//
// Diferente do Mercado Livre (que fecha em periodos MENSAIS fixos), a
// Amazon liquida (settle) pagamentos em ciclos proprios que nao coincidem
// com o filtro de datas arbitrario que o usuario escolhe no painel (o
// mesmo seletor "De/Ate" usado em Vendas). Por isso, em vez de usar
// ListFinancialEventGroups (que retorna por CICLO de liquidacao), usamos
// ListFinancialEvents com PostedAfter/PostedBefore -- isso soma os eventos
// financeiros (cobrancas de produto, tarifas, reembolsos) que efetivamente
// aconteceram dentro do periodo escolhido, do mesmo jeito que Vendas soma
// pedidos por data de criacao.
//
// v1: cobre os dois tipos de evento mais relevantes para o total
// (ShipmentEventList = vendas liquidadas + tarifas, RefundEventList =
// reembolsos). Os demais tipos de evento (ajustes, cupons, servicos FBA,
// etc.) ficam de fora por ora -- o valor pode nao bater 100% com o extrato
// oficial da Amazon ate cobrirmos todos os tipos. Suficiente para o
// objetivo atual (acompanhar faturamento no periodo), mas vale revisar
// antes de usar para conciliacao contabil formal.

const SPAPI_BASE = "https://sellingpartnerapi-na.amazon.com";

function aguardar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type Money = { CurrencyAmount?: number; CurrencyCode?: string };
type ChargeComponent = { ChargeType?: string; ChargeAmount?: Money };
type FeeComponent = { FeeType?: string; FeeAmount?: Money };
type ShipmentItem = { ItemChargeList?: ChargeComponent[]; ItemFeeList?: FeeComponent[] };
type ShipmentEvent = { AmazonOrderId?: string; PostedDate?: string; ShipmentItemList?: ShipmentItem[] };
type RefundEvent = { AmazonOrderId?: string; PostedDate?: string; ShipmentItemAdjustmentList?: ShipmentItem[] };

type FinancialEvents = {
  ShipmentEventList?: ShipmentEvent[];
  RefundEventList?: RefundEvent[];
};

type FinancialEventsResponse = {
  payload: {
    FinancialEvents: FinancialEvents;
    NextToken?: string;
  };
};

async function buscarPaginaEventos(
  accessToken: string,
  desde: string,
  ate: string,
  nextToken: string | undefined,
  tentativa = 0
): Promise<FinancialEventsResponse> {
  const params = new URLSearchParams(
    nextToken ? { NextToken: nextToken } : { PostedAfter: desde, PostedBefore: ate, MaxResultsPerPage: "100" }
  );

  const res = await fetch(`${SPAPI_BASE}/finances/v0/financialEvents?${params.toString()}`, {
    headers: { "x-amz-access-token": accessToken },
  });

  if (res.status === 429 && tentativa < 3) {
    await aguardar(3000 * (tentativa + 1));
    return buscarPaginaEventos(accessToken, desde, ate, nextToken, tentativa + 1);
  }

  if (!res.ok) {
    throw new Error(`Falha ao buscar eventos financeiros Amazon: ${res.status}`);
  }

  return res.json() as Promise<FinancialEventsResponse>;
}

function somarAjustes(itens: ShipmentItem[] | undefined): number {
  let total = 0;
  for (const item of itens ?? []) {
    for (const c of item.ItemChargeList ?? []) total += c.ChargeAmount?.CurrencyAmount ?? 0;
    for (const f of item.ItemFeeList ?? []) total += f.FeeAmount?.CurrencyAmount ?? 0;
  }
  return total;
}

export type ResumoFaturamentoAmazon = {
  totalLiquido: number; // vendas liquidadas + tarifas (negativas) + reembolsos (negativos), no periodo
  totalVendas: number; // soma bruta dos itens vendidos (ShipmentEventList)
  totalTarifas: number; // soma das tarifas cobradas (vem negativa da API)
  totalReembolsos: number; // soma dos reembolsos (vem negativa da API)
  moeda: string | null;
  cortado: boolean;
};

export async function getFaturamento(
  accessToken: string,
  periodo: { desde: string; ate: string }
): Promise<ResumoFaturamentoAmazon> {
  let totalVendas = 0;
  let totalTarifas = 0;
  let totalReembolsos = 0;
  let moeda: string | null = null;
  let nextToken: string | undefined;
  let primeira = true;
  let paginas = 0;
  const TETO_PAGINAS = 20; // salvaguarda contra periodos com muitos eventos

  do {
    if (!primeira) await aguardar(1100);
    primeira = false;
    paginas++;

    const data = await buscarPaginaEventos(accessToken, periodo.desde, periodo.ate, nextToken);
    const eventos = data.payload.FinancialEvents;

    for (const shipment of eventos.ShipmentEventList ?? []) {
      for (const item of shipment.ShipmentItemList ?? []) {
        for (const c of item.ItemChargeList ?? []) {
          totalVendas += c.ChargeAmount?.CurrencyAmount ?? 0;
          if (!moeda) moeda = c.ChargeAmount?.CurrencyCode ?? null;
        }
        for (const f of item.ItemFeeList ?? []) {
          totalTarifas += f.FeeAmount?.CurrencyAmount ?? 0;
        }
      }
    }

    for (const refund of eventos.RefundEventList ?? []) {
      totalReembolsos += somarAjustes(refund.ShipmentItemAdjustmentList);
    }

    nextToken = data.payload.NextToken;
  } while (nextToken && paginas < TETO_PAGINAS);

  return {
    totalLiquido: totalVendas + totalTarifas + totalReembolsos,
    totalVendas,
    totalTarifas,
    totalReembolsos,
    moeda,
    cortado: Boolean(nextToken),
  };
}
