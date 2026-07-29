import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getAnunciantes, getCampanhas } from "@/lib/mercadolivre/ads";

// ROTA TEMPORARIA DE DIAGNOSTICO -- NAO MUTA NENHUM DADO.
// Objetivo: descobrir se os endpoints de ESCRITA do Product Ads (documentados
// em global-selling.mercadolibre.com/devsite/en_us/new-product-ads, sob
// /marketplace/advertising/...) respondem para as contas ML domesticas da
// Sixxis, ou se sao exclusivos do programa Global Selling/CBT. Testamos com
// um PUT de corpo VAZIO {} -- se o endpoint existir e estiver autorizado, a
// API deve responder 400 (corpo invalido / nenhum campo enviado), nao
// executar nenhuma alteracao real. Se nao existir/nao autorizado: 404 ou 403.
// REMOVER esta rota depois do diagnostico (ver task de limpeza).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: contas } = await admin.from("ml_accounts").select("id, nickname, apelido").limit(5);

  const hoje = new Date();
  const ate = hoje.toISOString().slice(0, 10);
  const de = new Date(hoje.getTime() - 29 * 86400000).toISOString().slice(0, 10);

  for (const conta of contas ?? []) {
    try {
      const accessToken = await getValidAccessToken(conta.id);
      const anunciantes = await getAnunciantes(accessToken);
      if (anunciantes.length === 0) continue;

      for (const anunciante of anunciantes) {
        const { campanhas } = await getCampanhas(accessToken, anunciante.siteId, anunciante.advertiserId, de, ate);
        if (campanhas.length === 0) continue;

        const campanhaTeste = campanhas[0];

        // Teste 1: endpoint NOVO documentado (com prefixo /marketplace).
        const urlNovo = `https://api.mercadolibre.com/marketplace/advertising/${anunciante.siteId}/product_ads/campaigns/${campanhaTeste.id}`;
        const resNovo = await fetch(urlNovo, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "api-version": "2",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const corpoNovo = await resNovo.text();

        // Teste 2: mesmo path mas SEM prefixo /marketplace (formato que ja
        // usamos hoje pra leitura), pra comparar.
        const urlAntigo = `https://api.mercadolibre.com/advertising/${anunciante.siteId}/product_ads/campaigns/${campanhaTeste.id}`;
        const resAntigo = await fetch(urlAntigo, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "api-version": "2",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });
        const corpoAntigo = await resAntigo.text();

        return NextResponse.json({
          conta: conta.apelido || conta.nickname,
          siteId: anunciante.siteId,
          advertiserId: anunciante.advertiserId,
          campanhaTesteId: campanhaTeste.id,
          campanhaTesteNome: campanhaTeste.nome,
          teste_endpoint_novo: {
            url: urlNovo,
            status: resNovo.status,
            corpo: corpoNovo.slice(0, 1000),
          },
          teste_endpoint_antigo_sem_marketplace: {
            url: urlAntigo,
            status: resAntigo.status,
            corpo: corpoAntigo.slice(0, 1000),
          },
        });
      }
    } catch (err) {
      continue;
    }
  }

  return NextResponse.json({ erro: "Nenhuma conta com campanhas ativas encontrada pra testar." }, { status: 404 });
}
