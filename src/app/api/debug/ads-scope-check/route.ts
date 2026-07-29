import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

// ROTA TEMPORARIA DE DIAGNOSTICO -- 100% leitura, nao muta nada.
// Objetivo: descobrir (1) quais escopos nosso app tem registrado no
// Mercado Livre Developers (campo "scopes" do proprio app) e (2) quais
// escopos cada conta ML concedeu de fato ao autorizar (podem divergir --
// o app pode ja ter "write" habilitado mas a conta ter autorizado antes
// disso, com token antigo so de "read"). Isso decide se o proximo passo e
// so reautorizar as contas ou se precisa primeiro habilitar "write" no
// app em developers.mercadolivre.com.br (My Applications > editar app).
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
  const { data: contas } = await admin.from("ml_accounts").select("id, nickname, apelido, ml_user_id").limit(5);

  const appId = process.env.ML_CLIENT_ID;
  let primeiroToken: string | null = null;
  const porConta: Record<string, unknown> = {};

  for (const conta of contas ?? []) {
    try {
      const accessToken = await getValidAccessToken(conta.id);
      if (!primeiroToken) primeiroToken = accessToken;

      const resUser = await fetch(`https://api.mercadolibre.com/users/${conta.ml_user_id}/applications`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const corpoUser = await resUser.json().catch(() => null);
      const grantDesteApp = Array.isArray(corpoUser)
        ? corpoUser.find((g: { app_id: number | string }) => String(g.app_id) === String(appId))
        : null;

      porConta[conta.apelido || conta.nickname] = {
        status: resUser.status,
        scopesConcedidosParaNossoApp: grantDesteApp?.scopes ?? null,
        respostaCrua: Array.isArray(corpoUser) ? undefined : corpoUser,
      };
    } catch (err) {
      porConta[conta.apelido || conta.nickname] = { erro: String(err) };
    }
  }

  let appInfo: unknown = null;
  if (primeiroToken && appId) {
    const resApp = await fetch(`https://api.mercadolibre.com/applications/${appId}`, {
      headers: { Authorization: `Bearer ${primeiroToken}` },
    });
    appInfo = { status: resApp.status, corpo: await resApp.json().catch(() => null) };
  }

  return NextResponse.json({ appId, appInfo, porConta });
}
