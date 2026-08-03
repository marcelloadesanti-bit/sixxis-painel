import { createAdminClient } from "@/lib/supabase/admin";

// Lancamentos manuais do setor Comercial (vendas fechadas por dentro do
// Mercado Livre pelo time comercial, fora do fluxo normal de contas) --
// deduzidas do faturamento porque nao entram no comissionamento normal.
// Diferente do padrao de periodo livre de canais_manuais_lancamentos, aqui a
// chave e o MES CALENDARIO (ano, mes) com UNIQUE no banco: um unico valor
// consolidado por mes, upsertado em vez de acumulado -- evita duplicidade se
// o mesmo mes for tocado por presets/periodos diferentes e sobrepostos (ex:
// "01/07-31/07" e depois "ultimos 30 dias"). Usada por Relatorios (Vendas),
// Fechamento Mensal e pelo calculo automatico de Comissao, para os tres
// nunca divergirem no criterio.
export type ComercialValor = { numeroVendas: number; valorTotal: number };
export type ComercialLancamento = ComercialValor & { atualizadoEm: string };

export const COMERCIAL_ZERADO: ComercialValor = { numeroVendas: 0, valorTotal: 0 };

// Lista cada mes calendario (ano, mes) tocado pelo intervalo [de, ate]
// (formato YYYY-MM-DD, ambos inclusive).
function mesesTocados(de: string, ate: string): { ano: number; mes: number }[] {
  const [anoDe, mesDe] = de.split("-").map(Number);
  const [anoAte, mesAte] = ate.split("-").map(Number);
  const meses: { ano: number; mes: number }[] = [];
  let ano = anoDe;
  let mes = mesDe;
  let guarda = 0;
  while ((ano < anoAte || (ano === anoAte && mes <= mesAte)) && guarda < 120) {
    meses.push({ ano, mes });
    mes += 1;
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
    guarda += 1;
  }
  return meses;
}

// Soma o valor CHEIO de cada mes calendario tocado pelo periodo [de, ate] --
// sem pro-rata. Um relatorio/fechamento de um periodo parcial de um mes
// (ex: "01/07-15/07") ainda soma o mes de Julho inteiro, ja que o valor
// Comercial e lancado por mes fechado, nao por dia.
export async function buscarComercial(de: string, ate: string): Promise<ComercialValor> {
  const meses = mesesTocados(de, ate);
  if (meses.length === 0) return { ...COMERCIAL_ZERADO };

  const admin = createAdminClient();
  const anos = Array.from(new Set(meses.map((m) => m.ano)));
  const { data } = await admin
    .from("sige_comercial_lancamentos")
    .select("ano, mes, numero_vendas, valor_total")
    .in("ano", anos);

  const chaves = new Set(meses.map((m) => `${m.ano}-${m.mes}`));
  const linhas = (data ?? []).filter((r) => chaves.has(`${r.ano}-${r.mes}`));

  return linhas.reduce(
    (acc, r) => ({
      numeroVendas: acc.numeroVendas + (Number(r.numero_vendas) || 0),
      valorTotal: acc.valorTotal + (Number(r.valor_total) || 0),
    }),
    { ...COMERCIAL_ZERADO }
  );
}

// Le o lancamento de um unico mes -- usado pelo card em Relatorios para
// mostrar/editar o valor daquele mes especifico.
export async function buscarComercialMes(ano: number, mes: number): Promise<ComercialLancamento | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("sige_comercial_lancamentos")
    .select("numero_vendas, valor_total, atualizado_em")
    .eq("ano", ano)
    .eq("mes", mes)
    .maybeSingle();

  if (!data) return null;
  return {
    numeroVendas: Number(data.numero_vendas) || 0,
    valorTotal: Number(data.valor_total) || 0,
    atualizadoEm: data.atualizado_em as string,
  };
}

// Upsert por (ano, mes) -- grava/substitui o valor consolidado daquele mes.
export async function salvarComercialMes(
  ano: number,
  mes: number,
  numeroVendas: number,
  valorTotal: number,
  userId: string | null
): Promise<{ error: string | null }> {
  const admin = createAdminClient();
  const { error } = await admin.from("sige_comercial_lancamentos").upsert(
    {
      ano,
      mes,
      numero_vendas: numeroVendas,
      valor_total: valorTotal,
      atualizado_por: userId,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "ano,mes" }
  );
  return { error: error ? error.message : null };
}
