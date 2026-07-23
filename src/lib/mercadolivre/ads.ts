// Mercado Ads (Product Ads) - campanhas de publicidade e suas metricas.
// Docs: developers.mercadolivre.com.br/pt_br/product-ads-leitura
// IMPORTANTE: os endpoints legados (/advertising/advertisers/$ID/product_ads/campaigns)
// foram desativados em 26/02/2026. Usamos o endpoint atual
// /advertising/$SITE_ID/advertisers/$ADVERTISER_ID/product_ads/campaigns/search.

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
