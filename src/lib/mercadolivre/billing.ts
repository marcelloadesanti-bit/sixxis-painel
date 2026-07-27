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

// FASE 3: o rate limit do ML (5 req/min) é compartilhado entre TODAS as
// contas e conta cada chamada (periods + summary = 2 por conta). Em
// 27/07/2026 o carregamento sequencial com 2.5s entre contas ainda estourou
// o limite na 3a conta, porque as duas chamadas de uma mesma conta saiam
// juntas sem intervalo. Agora esperamos entre as duas chamadas também, com
// um intervalo alinhado ao refill do bucket (~1 token a cada 12s).
const ESPERA_ENTRE_CHAMADAS_MS = 13 * 1000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

// 27/07/2026: inspecionamos o JSON bruto (rota de debug temporaria) e
// descobrimos dois problemas na tipagem original, escrita so a partir da
// documentacao (sem nunca ter visto uma resposta real):
// 1) o campo certo e "total_perception" (singular) -- estavamos lendo
//    "total_perceptions" (plural), por isso sempre vinha undefined.
// 2) cada item de encargo/bonificacao tem MUITO mais informacao do que so
//    label/amount: "type" (codigo interno, ex: CVVML), "group_id" e
//    "group_description" (categoria, ex: "Cargos por venta"). O label as
//    vezes vem com nome amigavel em portugues (ex: "Campanhas de
//    publicidade - Product Ads"), as vezes vem so o codigo cru (igual ao
//    type). Usamos group_id/group_description para agrupar os encargos nas
//    mesmas categorias que aparecem no painel oficial do Mercado Livre.
type ItemFaturamento = {
  label: string;
  amount: number;
  type: string;
  group_id: number;
  group_description: string;
};

type ResumoApi = {
  user: { nickname: string };
  period: { date_from: string; date_to: string; expiration_date: string; key: string };
  bill_includes: {
    total_amount: number;
    total_perception: number;
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

// Nomes em português usados no painel oficial do Mercado Livre para cada
// categoria (group_id), confirmados observando o JSON real de 3 contas
// diferentes em 27/07/2026. Para um group_id que ainda não vimos, caímos de
// volta na descrição que a própria API manda (às vezes em espanhol) em vez
// de inventar uma tradução -- dado financeiro não pode ser um chute.
const GRUPO_LABEL_PT: Record<number, string> = {
  3: "Bonificações",
  6: "Tarifas de envios Full",
  11: "Tarifas de envios no Mercado Livre",
  14: "Tarifas de venda",
  21: "Tarifas da Minha Página (eShop)",
  24: "Tarifas por campanha de publicidade",
  32: "Taxas de parcelamento",
  37: "Tarifas do programa de afiliados",
  39: "Reembolso de DIFAL",
};

function nomeGrupoPt(item: ItemFaturamento): string {
  return GRUPO_LABEL_PT[item.group_id] ?? item.group_description?.trim() ?? "Outros";
}

export type ItemFaturamentoDetalhado = { label: string; valor: number; codigo: string; temDescricao: boolean };
export type GrupoFaturamento = { grupoId: number; nome: string; total: number; itens: ItemFaturamentoDetalhado[] };

// Agrupa os itens (encargos ou bonificações) pela categoria oficial do ML
// (group_id), somando o total de cada categoria -- é a mesma lógica que o
// painel do Mercado Livre usa para mostrar "Tarifas de venda: R$ X",
// "Tarifas de envios: R$ Y" etc.
function agruparPorCategoria(itens: ItemFaturamento[]): GrupoFaturamento[] {
  const porGrupo = new Map<number, GrupoFaturamento>();
  for (const item of itens) {
    const existente = porGrupo.get(item.group_id);
    const valor = item.amount ?? 0;
    const detalhe: ItemFaturamentoDetalhado = {
      label: item.label,
      valor,
      codigo: item.type,
      // Se o label veio igual ao codigo interno, o ML nao mandou uma
      // descricao amigavel para este item -- mostramos isso na tela em vez
      // de fingir que sabemos do que se trata.
      temDescricao: item.label !== item.type,
    };
    if (existente) {
      existente.total += valor;
      existente.itens.push(detalhe);
    } else {
      porGrupo.set(item.group_id, { grupoId: item.group_id, nome: nomeGrupoPt(item), total: valor, itens: [detalhe] });
    }
  }
  return [...porGrupo.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

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
  encargos: GrupoFaturamento[];
  bonificacoes: GrupoFaturamento[];
};

// Resumo de encargos e bonificacoes de um periodo especifico (identificado
// pela `key`, geralmente o primeiro dia do mes -- ex: "2026-07-01"). Devolve
// null quando o periodo nao existe para esta conta (404 -- por exemplo, um
// mes anterior a criacao da conta), em vez de estourar erro: isso permite ao
// seletor de meses anteriores tentar qualquer uma das ultimas 12 chaves sem
// se preocupar se a conta realmente teve movimento naquele mes.
export async function getResumoFaturamento(
  accessToken: string,
  periodoKey: string
): Promise<ResumoFaturamento | null> {
  const params = new URLSearchParams({ group: "ML", document_type: "BILL" });
  const res = await fetch(
    `${ML_API}/billing/integration/periods/key/${periodoKey}/summary/details?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (res.status === 404) return null;
  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`Falha ao buscar resumo de faturamento (${res.status}): ${corpo.slice(0, 300)}`);
  }

  const data = (await res.json()) as ResumoApi;

  // Alguns campos (ex: total_perceptions) nem sempre vem preenchidos pela
  // API para todas as contas -- sem o "?? 0" isso virava "R$ NaN" na tela.
  return {
    periodoKey: data.period.key,
    dataInicio: data.period.date_from,
    dataFim: data.period.date_to,
    totalCobrado: data.bill_includes.total_amount ?? 0,
    totalPercepcoes: data.bill_includes.total_perception ?? 0,
    totalPago: data.payment_collected.total_payment ?? 0,
    totalNotaCredito: data.payment_collected.total_credit_note ?? 0,
    totalRecebidoConsolidado: data.payment_collected.total_collected ?? 0,
    totalDivida: data.payment_collected.total_debt ?? 0,
    encargos: agruparPorCategoria(data.bill_includes.charges ?? []),
    bonificacoes: agruparPorCategoria(data.bill_includes.bonuses ?? []),
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

  // Intervalo entre as duas chamadas desta MESMA conta -- sem isso as duas
  // saiam juntas e consumiam 2 tokens do bucket de uma vez.
  await delay(ESPERA_ENTRE_CHAMADAS_MS);

  const resumo = await getResumoFaturamento(accessToken, periodo.key);
  if (!resumo) return null;
  return { periodo, resumo };
}

// 27/07/2026: seletor de "meses anteriores". A documentacao oficial do ML
// confirma que NAO e preciso consultar /monthly/periods antes -- a key de
// qualquer endpoint de periodo e sempre o primeiro dia do mes (ex:
// "2026-06-01"), entao geramos as chaves dos ultimos N meses localmente (sem
// gastar nenhuma chamada de API so pra montar a lista do seletor). Se a
// conta nao teve movimento naquele mes, getResumoFaturamento devolve null
// (404) e tratamos como "sem dados" -- sem gastar chamada extra nenhuma.
export function chavesDosUltimosMeses(quantidade = 12): { key: string; label: string }[] {
  const hoje = new Date();
  const meses: { key: string; label: string }[] = [];
  const nomesMes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  for (let i = 0; i < quantidade; i++) {
    const d = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth() - i, 1));
    const ano = d.getUTCFullYear();
    const mes = d.getUTCMonth();
    const key = `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
    meses.push({ key, label: `${nomesMes[mes]}/${ano}` });
  }
  return meses;
}
