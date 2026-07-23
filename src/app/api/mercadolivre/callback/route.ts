import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken, getUserInfo } from "@/lib/mercadolivre/oauth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Endpoint que o Mercado Livre chama depois que o vendedor autoriza o app.
// Valida o "state" (protecao CSRF), troca o code por token, busca o
// apelido/id da conta ML e salva tudo na tabela ml_accounts.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const errorParam = req.nextUrl.searchParams.get("error");

  if (errorParam) {
    return redirectComErro(req, "Autorizacao cancelada no Mercado Livre.");
  }

  if (!code) {
    return redirectComErro(req, "Codigo de autorizacao ausente.");
  }

  const cookieState = req.cookies.get("ml_oauth_state")?.value;
  if (!state || !cookieState || state !== cookieState) {
    return redirectComErro(req, "Falha na validacao de seguranca (state). Tente conectar novamente.");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const token = await exchangeCodeForToken(code);
    const conta = await getUserInfo(token.access_token);

    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

    const admin = createAdminClient();

    const { data: contaExistente } = await admin
      .from("ml_accounts")
      .select("id")
      .eq("ml_user_id", conta.id)
      .maybeSingle();
    const eraNova = !contaExistente;

    const { data: contaSalva, error: dbError } = await admin
      .from("ml_accounts")
      .upsert(
        {
          ml_user_id: conta.id,
          nickname: conta.nickname,
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          token_expires_at: expiresAt,
          scope: token.scope,
          site_id: conta.site_id,
          connected_by: user.id,
        },
        { onConflict: "ml_user_id" }
      )
      .select("id")
      .single();

    if (dbError) {
      console.error("Erro ao salvar ml_accounts:", dbError);
      return redirectComErro(req, "Conta autorizada, mas houve erro ao salvar no banco.");
    }

    // Conta nova: manda escolher a cor antes de ir para o painel.
    const destino = eraNova
      ? `/dashboard/contas/${contaSalva.id}?nova=1`
      : "/dashboard?conectado=" + conta.nickname;

    const response = NextResponse.redirect(new URL(destino, req.url));
    response.cookies.delete("ml_oauth_state");
    return response;
  } catch (err) {
    console.error("Erro no callback do Mercado Livre:", err);
    return redirectComErro(req, "Erro ao concluir a autorizacao com o Mercado Livre.");
  }
}

function redirectComErro(req: NextRequest, mensagem: string) {
  const url = new URL("/dashboard", req.url);
  url.searchParams.set("erro", mensagem);
  return NextResponse.redirect(url);
}
