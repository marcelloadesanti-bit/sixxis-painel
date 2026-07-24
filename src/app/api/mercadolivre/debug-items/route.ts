import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

// Rota temporaria de pesquisa da API de Itens (Anuncios) do ML.
// NAO faz parte do produto final - sera removida apos a pesquisa.
export async function GET() {
  const admin = createAdminClient();
  const { data: conta } = await admin
    .from("ml_accounts")
    .select("id, ml_user_id, nickname")
    .ilike("nickname", "%sixxis%")
    .limit(1)
    .maybeSingle();

  if (!conta) {
    return NextResponse.json({ erro: "conta nao encontrada" }, { status: 404 });
  }

  const accessToken = await getValidAccessToken(conta.id);
  const headers = { Authorization: `Bearer ${accessToken}` };

  const resultados: Record<string, unknown> = {};

  // 1. Lista de itens ativos, mais recentemente atualizados primeiro
  const buscaResp = await fetch(
    `https://api.mercadolibre.com/users/${conta.ml_user_id}/items/search?limit=5&offset=0&status=active&sort=last_updated_desc`,
    { headers }
  );
  const busca = await buscaResp.json();
  resultados.busca = busca;

  const primeiroItemId = busca.results?.[0];

  if (primeiroItemId) {
    const itemResp = await fetch(`https://api.mercadolibre.com/items/${primeiroItemId}`, { headers });
    const item = await itemResp.json();
    resultados.item = item;

    const hoje = new Date();
    const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const candidatos: Record<string, string> = {
      price_to_win: `https://api.mercadolibre.com/items/${primeiroItemId}/price_to_win?version=v2`,
      visits_window: `https://api.mercadolibre.com/items/${primeiroItemId}/visits/time_window?last=7&unit=day&ending=${fmt(hoje)}`,
      visits_range: `https://api.mercadolibre.com/items/${primeiroItemId}/visits?date_from=${fmt(seteDiasAtras)}T00:00:00.000-00:00&date_to=${fmt(hoje)}T23:59:59.000-00:00`,
      item_v2: `https://api.mercadolibre.com/items/${primeiroItemId}?include_attributes=all`,
    };

    resultados.candidatos = {};
    for (const [nome, url] of Object.entries(candidatos)) {
      try {
        const r = await fetch(url, { headers });
        (resultados.candidatos as Record<string, unknown>)[nome] = {
          status: r.status,
          body: await r.json().catch(() => null),
        };
      } catch (e) {
        (resultados.candidatos as Record<string, unknown>)[nome] = { erro: String(e) };
      }
    }
  }

  return NextResponse.json(resultados);
}
