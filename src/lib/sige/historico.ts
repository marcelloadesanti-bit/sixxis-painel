import { createAdminClient } from "@/lib/supabase/admin";

// Agregacao mensal do SIGE a partir dos fechamentos ja congelados
// (sige_fechamentos + sige_fechamento_itens + sige_fechamento_ads_itens).
// Usada tanto pela pagina de Historico de Desempenho quanto pela rota de
// Relatorio de Crescimento (api/sige/relatorio?tipo=crescimento), para as
// duas nunca divergirem no criterio de agrupamento por mes.
//
// Cada fechamento vira UMA linha, chaveada pelo mes calendario do inicio do
// periodo (periodo_de). Se houver mais de um fechamento no mesmo mes
// calendario (re-fechamento), fica o mais recente (por fechado_em) -- o uso
// esperado e um fechamento por mes, em sequencia.

const NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export type CanalHistorico = {
  tipo: "ml" | "amazon" | "manual";
  nome: string;
  vendas: number;
  faturamento: number;
};

export type AdsHistorico = {
  investimento: number;
  retorno: number;
  vendas: number;
  impressoes: number;
  cliques: number;
  roas: number | null;
  tacos: number | null;
  ctr: number | null;
};

export type LinhaHistoricoMensal = {
  mesChave: string; // "2026-07"
  rotulo: string; // "Jul/2026"
  fechamentoId: string;
  periodoDe: string;
  periodoAte: string;
  fechadoEm: string;
  porCanal: CanalHistorico[];
  totalVendas: number;
  totalFaturamento: number;
  ads: AdsHistorico;
};

// Retorna as linhas ORDENADAS ASCENDENTE por mes (mais antigo primeiro) --
// facilita achar "mes anterior" pelo indice. As paginas que exibem do mais
// recente para o mais antigo devem inverter a lista na hora de renderizar.
export async function buscarHistoricoMensal(): Promise<LinhaHistoricoMensal[]> {
  const admin = createAdminClient();

  const { data: fechamentos } = await admin
    .from("sige_fechamentos")
    .select("id, rotulo, periodo_de, periodo_ate, fechado_em")
    .order("periodo_de", { ascending: true });

  const lista = fechamentos ?? [];
  if (lista.length === 0) return [];

  const ids = lista.map((f) => f.id);
  const [{ data: itensVendas }, { data: itensAds }] = await Promise.all([
    admin
      .from("sige_fechamento_itens")
      .select("fechamento_id, tipo, nome_conta, vendas_liquidas, faturamento_liquido")
      .in("fechamento_id", ids),
    admin
      .from("sige_fechamento_ads_itens")
      .select("fechamento_id, investimento, retorno, vendas, impressoes, cliques")
      .in("fechamento_id", ids),
  ]);

  // Um fechamento por mes calendario -- em caso de empate, o mais recente
  // (por fechado_em) vence.
  const porMes = new Map<string, (typeof lista)[number]>();
  for (const f of lista) {
    const mesChave = f.periodo_de.slice(0, 7);
    const atual = porMes.get(mesChave);
    if (!atual || new Date(f.fechado_em) > new Date(atual.fechado_em)) {
      porMes.set(mesChave, f);
    }
  }

  const linhas: LinhaHistoricoMensal[] = Array.from(porMes.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mesChave, f]) => {
      const itens = (itensVendas ?? []).filter((i) => i.fechamento_id === f.id);
      const ads = (itensAds ?? []).filter((i) => i.fechamento_id === f.id);

      const porCanal: CanalHistorico[] = itens.map((i) => ({
        tipo: i.tipo as "ml" | "amazon" | "manual",
        nome: i.nome_conta as string,
        vendas: i.vendas_liquidas ?? 0,
        faturamento: Number(i.faturamento_liquido ?? 0),
      }));

      const totalVendas = porCanal.reduce((s, c) => s + c.vendas, 0);
      const totalFaturamento = porCanal.reduce((s, c) => s + c.faturamento, 0);

      const adsInvestimento = ads.reduce((s, a) => s + Number(a.investimento ?? 0), 0);
      const adsRetorno = ads.reduce((s, a) => s + Number(a.retorno ?? 0), 0);
      const adsVendas = ads.reduce((s, a) => s + Number(a.vendas ?? 0), 0);
      const adsImpressoes = ads.reduce((s, a) => s + Number(a.impressoes ?? 0), 0);
      const adsCliques = ads.reduce((s, a) => s + Number(a.cliques ?? 0), 0);

      const [ano, mes] = mesChave.split("-").map(Number);

      return {
        mesChave,
        rotulo: `${NOMES_MES[mes - 1]}/${ano}`,
        fechamentoId: f.id,
        periodoDe: f.periodo_de,
        periodoAte: f.periodo_ate,
        fechadoEm: f.fechado_em,
        porCanal,
        totalVendas,
        totalFaturamento,
        ads: {
          investimento: adsInvestimento,
          retorno: adsRetorno,
          vendas: adsVendas,
          impressoes: adsImpressoes,
          cliques: adsCliques,
          roas: adsInvestimento > 0 ? adsRetorno / adsInvestimento : null,
          tacos: totalFaturamento > 0 ? adsInvestimento / totalFaturamento : null,
          ctr: adsImpressoes > 0 ? adsCliques / adsImpressoes : null,
        },
      };
    });

  return linhas;
}

export function encontrarMesAnterior(linhas: LinhaHistoricoMensal[], idx: number): LinhaHistoricoMensal | null {
  return idx > 0 ? linhas[idx - 1] : null;
}

export function encontrarMesmoMesAnoAnterior(
  linhas: LinhaHistoricoMensal[],
  mesChave: string
): LinhaHistoricoMensal | null {
  const [ano, mes] = mesChave.split("-").map(Number);
  const chaveAnoAnterior = `${ano - 1}-${String(mes).padStart(2, "0")}`;
  return linhas.find((l) => l.mesChave === chaveAnoAnterior) ?? null;
}

export function variacao(atual: number, anterior: number | null | undefined): number | null {
  if (anterior === null || anterior === undefined || anterior === 0) return null;
  return (atual - anterior) / anterior;
}
