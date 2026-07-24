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

  // 1. Lista de itens do vendedor
  const buscaResp = await fetch(
    `https://api.mercadolibre.com/users/${conta.ml_user_id}/items/search?limit=5&offset=0`,
    { headers }
  );
  const busca = await buscaResp.json();
  resultados.busca = busca;

  const primeiroItemId = busca.results?.[0];

  if (primeiroItemId) {
    // 2. Detalhe do item
    const itemResp = await fetch(`https://api.mercadolibre.com/items/${primeiroItemId}`, { headers });
    resultados.item = await itemResp.json();

    // 3. Descricao
    const descResp = await fetch(`https://api.mercadolibre.com/items/${primeiroItemId}/description`, { headers });
    resultados.descricao = { status: descResp.status, body: await descResp.json().catch(() => null) };

    // 4. Health / qualidade (endpoints candidatos)
    const candidatos = [
      `https://api.mercadolibre.com/items/${primeiroItemId}/health`,
      `https://api.mercadolibre.com/reputation/items/${primeiroItemId}`,
      `https://api.mercadolibre.com/items/${primeiroItemId}/visits`,
    ];
    resultados.candidatosQualidade = {};
    for (const url of candidatos) {
      try {
        const r = await fetch(url, { headers });
        (resultados.candidatosQualidade as Record<string, unknown>)[url] = {
          status: r.status,
          body: await r.json().catch(() => null),
        };
      } catch (e) {
        (resultados.candidatosQualidade as Record<string, unknown>)[url] = { erro: String(e) };
      }
    }

    // 5. Variacoes / listing_type / sale_terms ja vem no item, sem chamada extra.

    // 6. Visitas do item (time_window)
    const visitasResp = await fetch(
      `https://api.mercadolibre.com/items/visits?ids=${primeiroItemId}`,
      { headers }
    );
    resultados.visitas = { status: visitasResp.status, body: await visitasResp.json().catch(() => null) };
  }

  return NextResponse.json(resultados);
}
