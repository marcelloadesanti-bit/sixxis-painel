// Devolucoes do Mercado Livre (vinculadas a reclamacoes).
// Docs: developers.mercadolivre.com.br/pt_br/gerenciar-devolucoes
//
// Nao existe um endpoint "em lote" de devolucoes por vendedor - cada
// devolucao esta amarrada a uma reclamacao (claim). Por isso, o fluxo e:
// 1) buscar as reclamacoes (abertas + fechadas) criadas no periodo
//    selecionado (ja implementado em claims.ts);
// 2) para cada uma, consultar /post-purchase/v2/claims/$CLAIM_ID/returns -
//    um 404 significa que aquela reclamacao nao tem devolucao associada,
//    entao e simplesmente ignorada;
// 3) para as que tem devolucao, buscar tambem o custo de envio da devolucao
//    (cobrado do vendedor) em /post-purchase/v1/claims/$CLAIM_ID/charges/return-cost.
//
// Para nao gerar uma quantidade excessiva de chamadas a cada carregamento da
// pagina, o numero de reclamacoes verificadas por conta e limitado a um teto
// pratico (TETO_CLAIMS_VERIFICADAS) dentro do periodo selecionado.

import { getReclamacoesNoPeriodo } from "./claims";

const ML_API = "https://api.mercadolibre.com";
const TETO_CLAIMS_VERIFICADAS = 150;

export type Devolucao = {
  id: number;
  claimId: number;
  status: string;
  subtipo: string;
  dataCriacao: string;
  dataFechamento: string | null;
  custo: number | null;
  moeda: string | null;
  contaId: string;
  contaNickname: string;
};

type ReturnApi = {
  id: number;
  claim_id: number;
  status: string;
  subtype: string;
  date_created: string;
  date_closed: string | null;
};

type ReturnCostApi = {
  currency_id: string;
  amount: number;
};

async function buscarDevolucaoDaReclamacao(
  accessToken: string,
  claimId: number,
  contaId: string,
  contaNickname: string
): Promise<Devolucao | null> {
  const res = await fetch(`${ML_API}/post-purchase/v2/claims/${claimId}/returns`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // 404 = essa reclamacao nao tem devolucao associada (caso normal e
  // esperado - a maioria das reclamacoes nao vira devolucao fisica).
  if (res.status === 404) return null;
  if (!res.ok) return null; // nao derruba a pagina por causa de uma devolucao isolada

  const data = (await res.json()) as ReturnApi;

  let custo: number | null = null;
  let moeda: string | null = null;
  try {
    const resCusto = await fetch(
      `${ML_API}/post-purchase/v1/claims/${claimId}/charges/return-cost`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (resCusto.ok) {
      const custoData = (await resCusto.json()) as ReturnCostApi;
      custo = custoData.amount;
      moeda = custoData.currency_id;
    }
  } catch {
    // custo e informativo - se falhar, a devolucao ainda e exibida sem custo
  }

  return {
    id: data.id,
    claimId: data.claim_id,
    status: data.status,
    subtipo: data.subtype,
    dataCriacao: data.date_created,
    dataFechamento: data.date_closed,
    custo,
    moeda,
    contaId,
    contaNickname,
  };
}

export async function getDevolucoesNoPeriodo(
  accessToken: string,
  mlUserId: number,
  periodo: { de: string; ate: string },
  contaId: string,
  contaNickname: string
): Promise<{ abertas: Devolucao[]; concluidas: Devolucao[]; custoTotal: number }> {
  const reclamacoes = (
    await getReclamacoesNoPeriodo(accessToken, mlUserId, periodo, contaId, contaNickname)
  ).slice(0, TETO_CLAIMS_VERIFICADAS);

  const resultados = await Promise.all(
    reclamacoes.map((r) => buscarDevolucaoDaReclamacao(accessToken, r.id, contaId, contaNickname))
  );

  const devolucoes = resultados.filter((d): d is Devolucao => d !== null);
  const abertas = devolucoes.filter((d) => d.dataFechamento === null);
  const concluidas = devolucoes.filter((d) => d.dataFechamento !== null);
  const custoTotal = devolucoes.reduce((s, d) => s + (d.custo ?? 0), 0);

  return { abertas, concluidas, custoTotal };
}
