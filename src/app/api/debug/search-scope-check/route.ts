import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

// ROTA TEMPORARIA DE DIAGNOSTICO -- 100% leitura, nao muta nada.
// Objetivo: descobrir se o endpoint publico /sites/MLB/search aceita
// seller_id / nickname / category para a nossa aplicacao, ja que o
// comentario em lib/mercadolivre/tendencias.ts registra que a busca geral
// (?q=) retorna 403 (endpoint restrito a parceiros aprovados desde as
// mudancas anti-scraping do ML). Precisamos saber se essa restricao vale
// pro endpoint inteiro ou so pra busca por palavra-chave, antes de
// planejar a secao de Concorrencia (que depende de buscar por loja e por
// categoria). REMOVER esta rota depois do diagnostico.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: contas } = await admin.from("ml_accounts").select("id, nickname, apelido, ml_user_id").limit(1);
  if (!contas || contas.length === 0) {
    return NextResponse.json({ erro: "Nenhuma conta ML encontrada." }, { status: 404 });
  }
  const conta = contas[0];
  const accessToken = await getValidAccessToken(conta.id);

  async function testar(nome: string, url: string) {
    try {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const texto = await resp.text();
      return { nome, url, status: resp.status, corpo: texto.slice(0, 500) };
    } catch (err) {
      return { nome, url, erro: String(err) };
    }
  }

  const resultados = await Promise.all([
    testar("busca_por_seller_id_propria_conta", `https://api.mercadolibre.com/sites/MLB/search?seller_id=${conta.ml_user_id}`),
    testar("busca_por_nickname_propria_conta", `https://api.mercadolibre.com/sites/MLB/search?nickname=${encodeURIComponent(conta.nickname ?? "")}`),
    testar("busca_por_categoria", `https://api.mercadolibre.com/sites/MLB/search?category=MLB1051`),
    testar("busca_por_query_generica", `https://api.mercadolibre.com/sites/MLB/search?q=furadeira`),
    testar("items_search_propria_conta_privado", `https://api.mercadolibre.com/users/${conta.ml_user_id}/items/search?limit=1`),
    testar("item_detalhe_concorrente_1", `https://api.mercadolibre.com/items/MLB4423087163`),
    testar("item_detalhe_concorrente_2", `https://api.mercadolibre.com/items/MLB110373240067`),
    testar("multiget_itens_concorrentes", `https://api.mercadolibre.com/items?ids=MLB4423087163,MLB110373240067`),
  ]);

  return NextResponse.json({ conta: conta.apelido || conta.nickname, resultados });
}
