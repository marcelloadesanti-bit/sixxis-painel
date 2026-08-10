// Mercado Ads (Product Ads) - campanhas de publicidade e suas metricas.
// Docs: developers.mercadolivre.com.br/pt_br/product-ads-leitura
// IMPORTANTE: os endpoints legados (/advertising/advertisers/$ID/product_ads/campaigns)
// foram desativados em 26/02/2026. Usamos o endpoint atual
// /advertising/$SITE_ID/advertisers/$ADVERTISER_ID/product_ads/campaigns/search.
// IMPORTANTE 2: a API do Product Ads hoje e SOMENTE LEITURA (monitoramento).
// Nao existe endpoint publico para criar/editar/pausar campanha -- isso so
// pode ser feito manualmente em ads.mercadolivre.com.br/productAds.

const ML_API = "https://api.mercadolibre.com";

const METRICAS = [
  "clicks",
  "prints",
  "ctr",
  "cost",
  "cpc",
  "acos",
  "units_quantity",
  "total_amount",
  "roas",
  "cvr",
].join(",");

export type Anunciante = {
  advertiserId: number;
  siteId: string;
  nome: string;
};

export type MetricasCampanha = {
  clicks: number;
  prints: number;
  ctr: number;
  cost: number;
  cpc: number;
  acos: number;
  units_quantity: number;
  total_amount: number;
  roas: number;
  cvr: number;
};

export type Campanha = {
  id: number;
  nome: string;
  status: string;
  orcamento: number;
  moeda: string;
  estrategia: string | null;
  // ROAS objetivo definido na campanha (substituiu o ACOS objetivo em
  // Jan/2026). Vem de graca no mesmo payload de busca, sem custo extra.
  roasObjetivo: number | null;
  metricas: MetricasCampanha;
};

// Uma conta pode ter zero ou mais "anunciantes" (advertiser_id) de Product Ads.
// Zero significa que a conta nunca ativou Mercado Ads.
export async function getAnunciantes(accessToken: string): Promise<Anunciante[]> {
  const res = await fetch(`${ML_API}/advertising/advertisers?product_id=PADS`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Api-Version": "1",
    },
  });

  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Falha ao buscar anunciantes: ${res.status}`);
  }

  const data = (await res.json()) as {
    advertisers?: { advertiser_id: number; site_id: string; advertiser_name: string }[];
  };

  return (data.advertisers ?? []).map((a) => ({
    advertiserId: a.advertiser_id,
    siteId: a.site_id,
    nome: a.advertiser_name,
  }));
}

// Campanhas de um anunciante com metricas resumidas no periodo.
export async function getCampanhas(
  accessToken: string,
  advertiserSiteId: string,
  advertiserId: number,
  de: string,
  ate: string
): Promise<{ total: number; campanhas: Campanha[] }> {
  const params = new URLSearchParams({
    limit: "50",
    offset: "0",
    date_from: de,
    date_to: ate,
    metrics: METRICAS,
    metrics_summary: "true",
  });

  const res = await fetch(
    `${ML_API}/advertising/${advertiserSiteId}/advertisers/${advertiserId}/product_ads/campaigns/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "api-version": "2",
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Falha ao buscar campanhas: ${res.status}`);
  }

  const data = (await res.json()) as {
    paging: { total: number };
    results: {
      id: number;
      name: string;
      status: string;
      budget: number;
      currency_id?: string;
      strategy?: string;
      roas_target?: number;
      metrics?: MetricasCampanha;
    }[];
  };

  // A moeda do site (MLB=BRL) e usada como fallback, ja que o /search nao
  // retorna currency_id por campanha (so o detalhe individual retorna).
  const moedaPorSite: Record<string, string> = { MLB: "BRL", MLA: "ARS", MLM: "MXN", MLC: "CLP" };

  const campanhas: Campanha[] = data.results.map((c) => ({
    id: c.id,
    nome: c.name,
    status: c.status,
    orcamento: c.budget,
    moeda: c.currency_id ?? moedaPorSite[advertiserSiteId] ?? "BRL",
    estrategia: c.strategy ?? null,
    roasObjetivo: c.roas_target ?? null,
    metricas: c.metrics ?? {
      clicks: 0,
      prints: 0,
      ctr: 0,
      cost: 0,
      cpc: 0,
      acos: 0,
      units_quantity: 0,
      total_amount: 0,
      roas: 0,
      cvr: 0,
    },
  }));

  return { total: data.paging.total, campanhas };
}

// --- Metricas por anuncio individual (nivel "product ad", nao campanha) ---
// Endpoint /product_ads/ads/search. Usado no ranking real de "melhores
// anuncios" de cada conta (substitui o antigo mock de Top 10). A API NAO
// retorna roas/ctr neste endpoint (so no de campanhas) -- calculamos os
// equivalentes localmente a partir de cost/total_amount/clicks/prints.
const METRICAS_ANUNCIO = ["clicks", "prints", "cost", "cpc", "acos", "units_quantity", "total_amount"].join(",");

export type Anuncio = {
  itemId: string;
  titulo: string;
  status: string;
  campanhaId: number;
  clicks: number;
  prints: number;
  cost: number;
  totalAmount: number;
  unitsQuantity: number;
  ctr: number | null;
  roas: number | null;
};

// Ranking real de anuncios de um anunciante no periodo, ordenado por vendas
// (total_amount) desc -- ja usa o parametro sort_by da propria API.
export async function getAnuncios(
  accessToken: string,
  advertiserSiteId: string,
  advertiserId: number,
  de: string,
  ate: string,
  limite = 10
): Promise<Anuncio[]> {
  const params = new URLSearchParams({
    limit: String(limite),
    offset: "0",
    date_from: de,
    date_to: ate,
    metrics: METRICAS_ANUNCIO,
    sort_by: "total_amount",
    sort: "desc",
  });

  const res = await fetch(
    `${ML_API}/advertising/${advertiserSiteId}/advertisers/${advertiserId}/product_ads/ads/search?${params.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "api-version": "2",
      },
    }
  );

  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Falha ao buscar anuncios: ${res.status}`);
  }

  const data = (await res.json()) as {
    results: {
      item_id: string;
      title: string;
      status: string;
      campaign_id: number;
      metrics?: {
        clicks: number;
        prints: number;
        cost: number;
        total_amount: number;
        units_quantity: number;
      };
    }[];
  };

  return (data.results ?? []).map((a) => {
    const m = a.metrics ?? { clicks: 0, prints: 0, cost: 0, total_amount: 0, units_quantity: 0 };
    return {
      itemId: a.item_id,
      titulo: a.title,
      status: a.status,
      campanhaId: a.campaign_id,
      clicks: m.clicks,
      prints: m.prints,
      cost: m.cost,
      totalAmount: m.total_amount,
      unitsQuantity: m.units_quantity,
      ctr: m.prints > 0 ? m.clicks / m.prints : null,
      roas: m.cost > 0 ? m.total_amount / m.cost : null,
    };
  });
}

// Ranking de anuncios ordenado por investimento (cost) desc -- necessario
// porque getAnuncios (ordenado por vendas) nunca traz os PIORES anuncios:
// um anuncio com gasto alto e poucas vendas (TACOS ruim) fica fora do top
// por vendas, mas e exatamente o que a Metricas de Desempenho precisa
// encontrar. Usado em conjunto com getAnuncios (uniao das duas listas,
// dedupe por itemId) na pagina de Metricas de Desempenho.
export async function getAnunciosPorInvestimento(
    accessToken: string,
    advertiserSiteId: string,
    advertiserId: number,
    de: string,
    ate: string,
    limite = 20
  ): Promise<Anuncio[]> {
    const params = new URLSearchParams({
          limit: String(limite),
          offset: "0",
          date_from: de,
          date_to: ate,
          metrics: METRICAS_ANUNCIO,
          sort_by: "cost",
          sort: "desc",
    });
  
    const res = await fetch(
          `${ML_API}/advertising/${advertiserSiteId}/advertisers/${advertiserId}/product_ads/ads/search?${params.toString()}`,
      {
              headers: {
                        Authorization: `Bearer ${accessToken}`,
                        "api-version": "2",
              },
      }
        );
  
    if (res.status === 404) return [];
    if (!res.ok) {
          throw new Error(`Falha ao buscar anuncios por investimento: ${res.status}`);
    }
  
    const data = (await res.json()) as {
          results: {
                  item_id: string;
                  title: string;
                  status: string;
                  campaign_id: number;
                  metrics?: {
                            clicks: number;
                            prints: number;
                            cost: number;
                            total_amount: number;
                            units_quantity: number;
                  };
          }[];
    };
  
    return (data.results ?? []).map((a) => {
          const m = a.metrics ?? { clicks: 0, prints: 0, cost: 0, total_amount: 0, units_quantity: 0 };
          return {
                  itemId: a.item_id,
                  titulo: a.title,
                  status: a.status,
                  campanhaId: a.campaign_id,
                  clicks: m.clicks,
                  prints: m.prints,
                  cost: m.cost,
                  totalAmount: m.total_amount,
                  unitsQuantity: m.units_quantity,
                  ctr: m.prints > 0 ? m.clicks / m.prints : null,
                  roas: m.cost > 0 ? m.total_amount / m.cost : null,
          };
    });
}

// --- Metricas avancadas de campanha (impression share, etc.) ---
// So existem no endpoint de DETALHE de uma campanha (nao no /search), ou
// seja, precisam de 1 chamada por campanha. Por isso so devem ser buscadas
// para um numero limitado de campanhas (ver TETO_METRICAS_AVANCADAS em
// publicidade/page.tsx), para nao arriscar rate limit (429) somando essas
// chamadas as demais que a pagina de Publicidade ja faz.
export type MetricasAvancadasCampanha = {
  impressionShare: number | null;
  topImpressionShare: number | null;
  lostShareOrcamento: number | null;
  lostShareRanking: number | null;
  acosBenchmark: number | null;
};

const METRICAS_AVANCADAS = [
  "impression_share",
  "top_impression_share",
  "lost_impression_share_by_budget",
  "lost_impression_share_by_ad_rank",
  "acos_benchmark",
].join(",");

// Retorna null em qualquer falha (nunca lanca erro) -- essas metricas sao um
// complemento opcional do card de campanha, nao podem derrubar a pagina.
export async function getMetricasAvancadasCampanha(
  accessToken: string,
  advertiserSiteId: string,
  campanhaId: number,
  de: string,
  ate: string
): Promise<MetricasAvancadasCampanha | null> {
  try {
    const params = new URLSearchParams({ date_from: de, date_to: ate, metrics: METRICAS_AVANCADAS });
    const res = await fetch(
      `${ML_API}/advertising/${advertiserSiteId}/product_ads/campaigns/${campanhaId}?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "api-version": "2",
        },
      }
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      metrics?: {
        impression_share?: number;
        top_impression_share?: number;
        lost_impression_share_by_budget?: number;
        lost_impression_share_by_ad_rank?: number;
        acos_benchmark?: number;
      };
    };
    const m = data.metrics;
    if (!m) return null;

    return {
      impressionShare: m.impression_share ?? null,
      topImpressionShare: m.top_impression_share ?? null,
      lostShareOrcamento: m.lost_impression_share_by_budget ?? null,
      lostShareRanking: m.lost_impression_share_by_ad_rank ?? null,
      acosBenchmark: m.acos_benchmark ?? null,
    };
  } catch {
    return null;
  }
}
