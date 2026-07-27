// Faturamento (Billing Reports) do Mercado Livre.
// Docs: developers.mercadolivre.com.br/pt_br/relatorios-de-faturamento
//
// FASE 2: em 26/07/2026 um teste manual bateu em /billing/monthly/periods e
// recebeu 404 -- essa rota nao existe. A documentacao oficial usa o prefixo
// /billing/integration/... em todos os endpoints. Em 27/07/2026 confirmamos
// tambem que o escopo "Faturamento" do app ja estava habilitado (Leitura e
// escrita) desde a criacao, e reautorizamos as 5 contas para garantir tokens
// novos. Esta lib usa o caminho correto da documentacao.

const ML_API = "https://api.mercadolibre.com";

type PeriodoApi = {
  amount: number;
  unpaid_amount: number;
  period: { date_from: string; date_to: string };
  key: string;
  expiration_date: string;
  period_status: "OPEN" | "CLOSED";
};

export type PeriodoFaturamento = {
  key: string;
  dataInicio: string;
  dataFim: string;
  valor: number;
  valorPendente: number;
  status: "OPEN" | "CLOSED";
};

// Busca o periodo de faturamento mais recente disponivel para a conta
// (grupo ML = Mercado Livre, nao Mercado Pago). Retorna null se a conta
// nao tiver nenhum periodo (conta muito nova, por exemplo).
export async function getPeriodoMaisRecente(
  accessToken: string,
  mlUserId: number
): Promise<PeriodoFaturamento | null> {
  const params = new URLSearchParams({ group: "ML", document_type: "BILL", limit: "1" });
  const res = await fetch(`${ML_API}/billing/integration/monthly/periods?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404) return null;
  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`Falha ao buscar período de faturamento (${res.status}): ${corpo.slice(0, 300)}`);
  }

  const data = (await res.json()) as { results: PeriodoApi[] };
  const p = data.results?.[0];
  if (!p) return null;

  return {
    key: p.key,
    dataInicio: p.period.date_from,
    dataFim: p.period.date_to,
    valor: p.amount,
    valorPendente: p.unpaid_amount,
    status: p.period_status,
  };
}

type ItemFaturamento = { label: string; amount: number; type: string };

type ResumoApi = {
  user: { nickname: string };
  period: { date_from: string; date_to: string; expiration_date: string; key: string };
  bill_includes: {
    total_amount: number;
    total_perceptions: number;
    bonuses: ItemFaturamento[];
    charges: ItemFaturamento[];
  };
  payment_collected: {
    operation_discount: number;
    total_payment: number;
    total_credit_note: number;
    total_collected: number;
    total_debt: number;
  };
  errors: unknown[];
};

export type ResumoFaturamento = {
  periodoKey: string;
  dataInicio: string;
  dataFim: string;
  totalCobrado: number;
  totalPercepcoes: number;
  totalPago: number;
  totalNotaCredito: number;
  totalRecebidoConsolidado: number;
  totalDivida: number;
  encargos: { label: string; valor: number }[];
  bonificacoes: { label: string; valor: number }[];
};

// Resumo de encargos e bonificacoes de um periodo especifico (identificado
// pela `key`, geralmente o primeiro dia do mes -- ex: "2026-07-01").
export async function getResumoFaturamento(
  accessToken: string,
  periodoKey: string
): Promise<ResumoFaturamento> {
  const params = new URLSearchParams({ group: "ML" });
  const res = await fetch(
    `${ML_API}/billing/integration/periods/key/${periodoKey}/summary/details?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`Falha ao buscar resumo de faturamento (${res.status}): ${corpo.slice(0, 300)}`);
  }

  const data = (await res.json()) as ResumoApi;

  return {
    periodoKey: data.period.key,
    dataInicio: data.period.date_from,
    dataFim: data.period.date_to,
    totalCobrado: data.bill_includes.total_amount,
    totalPercepcoes: data.bill_includes.total_perceptions,
    totalPago: data.payment_collected.total_payment,
    totalNotaCredito: data.payment_collected.total_credit_note,
    totalRecebidoConsolidado: data.payment_collected.total_collected,
    totalDivida: data.payment_collected.total_debt,
    encargos: (data.bill_includes.charges ?? []).map((c) => ({ label: c.label, valor: c.amount })),
    bonificacoes: (data.bill_includes.bonuses ?? []).map((b) => ({ label: b.label, valor: b.amount })),
  };
}

// Atalho: periodo mais recente + resumo, numa unica chamada. Usado na
// pagina de Faturamento (versao de verificacao/Fase 2).
export async function getFaturamentoConta(
  accessToken: string,
  mlUserId: number
): Promise<{ periodo: PeriodoFaturamento; resumo: ResumoFaturamento } | null> {
  const periodo = await getPeriodoMaisRecente(accessToken, mlUserId);
  if (!periodo) return null;

  const resumo = await getResumoFaturamento(accessToken, periodo.key);
  return { periodo, resumo };
}
