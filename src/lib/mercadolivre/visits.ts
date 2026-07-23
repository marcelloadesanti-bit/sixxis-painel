// Visitas (visualizacoes) dos anuncios de uma conta, para os cards de
// visualizacoes/conversao do Resumo.
// Docs: developers.mercadolivre.com.br (recurso Visits)

const ML_API = "https://api.mercadolibre.com";

export async function getTotalVisitas(
  accessToken: string,
  mlUserId: number,
  de: string,
  ate: string
): Promise<number> {
  const params = new URLSearchParams({ date_from: de, date_to: ate });
  const res = await fetch(
    `${ML_API}/users/${mlUserId}/items_visits?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    throw new Error(`Falha ao buscar visitas: ${res.status}`);
  }

  const data = (await res.json()) as { total_visits: number };
  return data.total_visits ?? 0;
}
