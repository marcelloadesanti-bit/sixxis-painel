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

export type PontoVisitasDiaria = { data: string; total: number };

// Serie diaria de visitas para o grafico comparativo do Resumo. Usa o
// recurso time_window (granularidade "day"), limitado a 150 dias pela API.
export async function getSerieDiariaVisitas(
  accessToken: string,
  mlUserId: number,
  de: string,
  ate: string
): Promise<PontoVisitasDiaria[]> {
  const dias =
    Math.round((new Date(ate + "T00:00:00").getTime() - new Date(de + "T00:00:00").getTime()) / 86400000) + 1;
  const params = new URLSearchParams({
    last: String(Math.min(Math.max(dias, 1), 150)),
    unit: "day",
    ending: ate,
  });

  const res = await fetch(`${ML_API}/users/${mlUserId}/items_visits/time_window?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Falha ao buscar serie diaria de visitas: ${res.status}`);
  }

  const data = (await res.json()) as { results: { date: string; total: number }[] };
  return (data.results ?? []).map((r) => ({ data: r.date.slice(0, 10), total: r.total }));
}
