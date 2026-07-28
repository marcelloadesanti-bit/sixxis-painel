import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getAnunciantes, getCampanhas } from "@/lib/mercadolivre/ads";

// Agregacao de Publicidade/Ads por conta (Mercado Ads real, por enquanto --
// Amazon Ads ainda nao tem integracao, ver app/dashboard/amazon/publicidade)
// e por plataforma manual (Google Ads, Meta Ads, lancados no Fechamento
// Mensal e reaproveitados aqui). Espelha o padrao de lib/sige/vendas.ts.
export type ItemAds = {
  id: string;
  tipo: "ml" | "manual";
  contaRef: string;
  nome: string;
  cor: string;
  investimento: number;
  retorno: number;
  vendas: number;
  impressoes: number;
  cliques: number;
  erro?: string;
};

export const ADS_ZERADO = { investimento: 0, retorno: 0, vendas: 0, impressoes: 0, cliques: 0 };

export function somarItensAds(itens: ItemAds[]) {
  return itens.reduce(
    (acc, i) => ({
      investimento: acc.investimento + i.investimento,
      retorno: acc.retorno + i.retorno,
      vendas: acc.vendas + i.vendas,
      impressoes: acc.impressoes + i.impressoes,
      cliques: acc.cliques + i.cliques,
    }),
    { ...ADS_ZERADO }
  );
}

// Mercado Ads real: soma o custo/vendas/impressoes/cliques de todas as
// campanhas de todos os "anunciantes" (advertiser_id) de cada conta ML no
// periodo. Uma conta pode ter 0 anunciantes (nunca ativou Mercado Ads) --
// nesse caso entra zerada, sem erro. `idsFiltro`, se informado, usa o mesmo
// formato "ml:<uuid>" das demais rotas do SIGE.
export async function buscarAdsMl(de: string, ate: string, idsFiltro: string[] | null): Promise<ItemAds[]> {
  const admin = createAdminClient();
  const querConta = (id: string) => !idsFiltro || idsFiltro.includes(`ml:${id}`);

  const { data: contasMl } = await admin.from("ml_accounts").select("id, nickname, apelido, cor");

  const itens = await Promise.all(
    (contasMl ?? [])
      .filter((c) => querConta(c.id))
      .map(async (c): Promise<ItemAds> => {
        const nome = c.apelido || c.nickname;
        try {
          const accessToken = await getValidAccessToken(c.id);
          const anunciantes = await getAnunciantes(accessToken);
          if (anunciantes.length === 0) {
            return { id: `ml:${c.id}`, tipo: "ml", contaRef: c.id, nome, cor: c.cor ?? "#64748b", ...ADS_ZERADO };
          }
          const listas = await Promise.all(
            anunciantes.map((a) => getCampanhas(accessToken, a.siteId, a.advertiserId, de, ate))
          );
          const campanhas = listas.flatMap((r) => r.campanhas);
          return {
            id: `ml:${c.id}`,
            tipo: "ml",
            contaRef: c.id,
            nome,
            cor: c.cor ?? "#64748b",
            investimento: campanhas.reduce((s, camp) => s + camp.metricas.cost, 0),
            retorno: campanhas.reduce((s, camp) => s + camp.metricas.total_amount, 0),
            vendas: campanhas.reduce((s, camp) => s + camp.metricas.units_quantity, 0),
            impressoes: campanhas.reduce((s, camp) => s + camp.metricas.prints, 0),
            cliques: campanhas.reduce((s, camp) => s + camp.metricas.clicks, 0),
          };
        } catch (err) {
          console.error(`Erro ao buscar Ads de ${nome}:`, err);
          return {
            id: `ml:${c.id}`,
            tipo: "ml",
            contaRef: c.id,
            nome,
            cor: c.cor ?? "#64748b",
            ...ADS_ZERADO,
            erro: "Falha ao buscar Mercado Ads desta conta.",
          };
        }
      })
  );

  return itens;
}

const PLATAFORMAS_MANUAIS: { key: string; nome: string; cor: string }[] = [
  { key: "google_ads", nome: "Google Ads", cor: "#4285F4" },
  { key: "meta_ads", nome: "Meta Ads", cor: "#0866FF" },
];

// Ads manuais (Google Ads, Meta Ads): somados a partir de sige_ads_manuais,
// que so e alimentada pelo Fechamento Mensal (mesmo padrao de
// canais_manuais_lancamentos para os canais de venda manuais). Nao ha filtro
// de conta aqui -- sao so 2 plataformas fixas, sempre incluidas.
export async function buscarAdsManuais(de: string, ate: string): Promise<ItemAds[]> {
  const admin = createAdminClient();

  const { data: lancamentos } = await admin
    .from("sige_ads_manuais")
    .select("plataforma, periodo_de, periodo_ate, investimento, retorno, vendas, impressoes, cliques")
    .lte("periodo_de", ate)
    .gte("periodo_ate", de);

  const porPlataforma = new Map<string, { investimento: number; retorno: number; vendas: number; impressoes: number; cliques: number }>();
  for (const l of lancamentos ?? []) {
    const atual = porPlataforma.get(l.plataforma) ?? { ...ADS_ZERADO };
    atual.investimento += Number(l.investimento ?? 0);
    atual.retorno += Number(l.retorno ?? 0);
    atual.vendas += Number(l.vendas ?? 0);
    atual.impressoes += Number(l.impressoes ?? 0);
    atual.cliques += Number(l.cliques ?? 0);
    porPlataforma.set(l.plataforma, atual);
  }

  return PLATAFORMAS_MANUAIS.map((p) => {
    const t = porPlataforma.get(p.key) ?? { ...ADS_ZERADO };
    return { id: `manual_ads:${p.key}`, tipo: "manual" as const, contaRef: p.key, nome: p.nome, cor: p.cor, ...t };
  });
}
