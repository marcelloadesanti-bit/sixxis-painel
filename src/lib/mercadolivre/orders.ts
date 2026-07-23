// Consulta de pedidos/vendas na API do Mercado Livre.
// Docs: developers.mercadolivre.com.br/pt_br/gestao-de-vendas

const ML_API = "https://api.mercadolibre.com";

export type ResumoVendas = {
  totalPedidos: number;
  valorSomado: number;
  amostraParcial: boolean;
  moeda: string | null;
};

// Retorna um resumo de pedidos pagos dos ultimos `dias` dias para o
// vendedor informado. Para manter simples e rapido, soma o valor apenas
// da pagina retornada (ate `limite` pedidos mais recentes); se houver mais
// pedidos que isso, `amostraParcial` fica true e `totalPedidos` reflete o
// total real informado pela API (mesmo que o valor somado seja parcial).
export async function getResumoVendas(
  accessToken: string,
  mlUserId: number,
  { dias = 30, limite = 50 }: { dias?: number; limite?: number } = {}
): Promise<ResumoVendas> {
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    seller: String(mlUserId),
    "order.status": "paid",
    "order.date_created.from": desde,
    sort: "date_desc",
    limit: String(limite),
  });

  const res = await fetch(`${ML_API}/orders/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Falha ao buscar pedidos: ${res.status}`);
  }

  const data = (await res.json()) as {
    paging: { total: number };
    results: { total_amount: number; currency_id: string }[];
  };

  const valorSomado = data.results.reduce((soma, pedido) => soma + (pedido.total_amount ?? 0), 0);
  const moeda = data.results[0]?.currency_id ?? null;

  return {
    totalPedidos: data.paging.total,
    valorSomado,
    amostraParcial: data.paging.total > data.results.length,
    moeda,
  };
}
