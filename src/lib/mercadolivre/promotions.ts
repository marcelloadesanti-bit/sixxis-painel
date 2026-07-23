// Promocoes/campanhas disponiveis para o vendedor (Central de promocoes).
// Docs: global-selling.mercadolibre.com/devsite/manage-promotions-gs
// (mesmo recurso /marketplace/seller-promotions, comum a todos os sites do ML)

const ML_API = "https://api.mercadolibre.com";

export type Promocao = {
  id: string;
  tipo: string;
  status: string;
  nome: string | null;
  dataInicio: string | null;
  dataFim: string | null;
  contaId: string;
  contaNickname: string;
};

const TIPO_LABELS: Record<string, string> = {
  DEAL: "Oferta relâmpago / campanha",
  MARKETPLACE_CAMPAIGN: "Campanha com co-participação",
  DOD: "Oferta do dia",
  LIGHTNING: "Oferta relâmpago",
  PRE_NEGOTIATED: "Desconto pré-acordado",
  SELLER_CAMPAIGN: "Campanha do vendedor",
  SMART: "Campanha inteligente",
  PRICE_DISCOUNT: "Desconto individual",
  VOLUME: "Desconto por quantidade",
};

export function labelTipoPromocao(tipo: string): string {
  return TIPO_LABELS[tipo] ?? tipo;
}

// Lista as promocoes (ativas, pendentes ou encerradas) disponiveis/atribuidas
// ao vendedor. Um vendedor pode ter varios convites/tipos ao mesmo tempo.
export async function getPromocoesVendedor(
  accessToken: string,
  mlUserId: number,
  contaId: string,
  contaNickname: string
): Promise<Promocao[]> {
  const promocoes: Promocao[] = [];
  let searchAfter: string | undefined;

  for (let pagina = 0; pagina < 10; pagina++) {
    const params = new URLSearchParams({ limit: "50", app_version: "v2" });
    if (searchAfter) params.set("search_after", searchAfter);

    const res = await fetch(
      `${ML_API}/seller-promotions/users/${mlUserId}?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (res.status === 404) break;
    if (!res.ok) {
      throw new Error(`Falha ao buscar promoções: ${res.status}`);
    }

    const data = (await res.json()) as {
      results: {
        id: string;
        type: string;
        status: string;
        name?: string;
        start_date?: string;
        finish_date?: string;
      }[];
      paging: { searchAfter?: string };
    };

    for (const p of data.results) {
      promocoes.push({
        id: p.id,
        tipo: p.type,
        status: p.status,
        nome: p.name ?? null,
        dataInicio: p.start_date ?? null,
        dataFim: p.finish_date ?? null,
        contaId,
        contaNickname,
      });
    }

    searchAfter = data.paging.searchAfter || undefined;
    if (!searchAfter || data.results.length === 0) break;
  }

  return promocoes;
}
