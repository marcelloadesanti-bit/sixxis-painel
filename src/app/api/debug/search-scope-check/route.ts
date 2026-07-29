import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

// ROTA TEMPORARIA DE DIAGNOSTICO -- 100% leitura.
// Objetivo: inspecionar o corpo cru de /users/{id}/items/search?include_filters=true
// pra descobrir o formato real do bloco de filtro de categoria (a lib
// concorrencia.ts assumiu um formato que nao esta batendo -- retornando
// lista vazia de categorias). REMOVER depois do diagnostico.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: contas } = await admin.from("ml_accounts").select("id, nickname, ml_user_id").limit(1);
  if (!contas || contas.length === 0) {
    return NextResponse.json({ erro: "Nenhuma conta ML encontrada." }, { status: 404 });
  }
  const conta = contas[0];
  const accessToken = await getValidAccessToken(conta.id);

  const resp = await fetch(
    `https://api.mercadolibre.com/users/${conta.ml_user_id}/items/search?status=active&include_filters=true&limit=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const texto = await resp.text();

  return NextResponse.json({ conta: conta.nickname, status: resp.status, corpo: texto.slice(0, 3000) });
}
