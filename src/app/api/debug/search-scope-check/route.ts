import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

// ROTA TEMPORARIA DE DIAGNOSTICO -- 100% leitura, nao muta nada.
// Objetivo: validar 3 APIs OFICIAIS (OAuth, mesmo token que ja usamos) antes
// de desenhar a secao de Concorrencia:
// 1. /highlights/{site}/category/{category_id} -- mais vendidos por categoria
// 2. /products/{product_id} -- detalhe de um PRODUCT do catalogo (id devolvido
//    pelo highlights) -- testar se e publico (sem dono) ao contrario de /items/{id}
// 3. /suggestions/user/{user_id}/items + /suggestions/items/{item_id}/details
//    -- referencias de preco (benchmark) para um item NOSSO
// REMOVER esta rota depois do diagnostico.
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
      return { nome, url, status: resp.status, corpo: texto.slice(0, 800) };
    } catch (err) {
      return { nome, url, erro: String(err) };
    }
  }

  // Pega uma categoria real de um item nosso, e o proprio item, para os testes.
  const resItens = await fetch(`https://api.mercadolibre.com/users/${conta.ml_user_id}/items/search?limit=1`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const corpoItens = await resItens.json().catch(() => null);
  const nossoItemId = corpoItens?.results?.[0];

  let categoriaId: string | null = null;
  let nossoItemDetalhe: any = null;
  if (nossoItemId) {
    const resItem = await fetch(`https://api.mercadolibre.com/items/${nossoItemId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    nossoItemDetalhe = await resItem.json().catch(() => null);
    categoriaId = nossoItemDetalhe?.category_id ?? null;
  }

  const resultados: any[] = [];

  if (categoriaId) {
    resultados.push(await testar("highlights_por_categoria", `https://api.mercadolibre.com/highlights/MLB/category/${categoriaId}`));
  }

  resultados.push(
    await testar("sugestoes_itens_com_referencia_por_vendedor", `https://api.mercadolibre.com/suggestions/user/${conta.ml_user_id}/items`)
  );

  if (nossoItemId) {
    resultados.push(
      await testar("sugestao_preco_detalhe_item_nosso", `https://api.mercadolibre.com/suggestions/items/${nossoItemId}/details`)
    );
  }

  // Extrai um id do tipo PRODUCT do resultado do highlights (se houver) pra testar /products/{id}
  const highlightsResultado = resultados.find((r) => r.nome === "highlights_por_categoria");
  let produtoTesteId: string | null = null;
  try {
    const corpo = JSON.parse(highlightsResultado?.corpo ?? "{}");
    const produto = (corpo.content ?? []).find((c: any) => c.type === "PRODUCT");
    produtoTesteId = produto?.id ?? null;
  } catch {
    // ignora
  }
  if (produtoTesteId) {
    resultados.push(await testar("detalhe_produto_catalogo_terceiro", `https://api.mercadolibre.com/products/${produtoTesteId}`));
  }

  return NextResponse.json({
    conta: conta.apelido || conta.nickname,
    nossoItemId,
    categoriaId,
    produtoTesteId,
    resultados,
  });
}
