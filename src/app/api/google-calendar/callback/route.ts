import { NextRequest, NextResponse } from "next/server";
import { exchangeGoogleCodeForToken, getGoogleUserEmail } from "@/lib/google/calendar-oauth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Endpoint que o Google chama depois que o usuario autoriza o acesso ao
// proprio Calendar. Valida o "state" (protecao CSRF), troca o code por
// token e salva o refresh_token no perfil do usuario logado.
export async function GET(req: NextRequest) {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const errorParam = req.nextUrl.searchParams.get("error");

  if (errorParam) {
        return redirectComErro(req, "Autorizacao cancelada no Google.");
  }

  if (!code) {
        return redirectComErro(req, "Codigo de autorizacao ausente.");
  }

  const cookieState = req.cookies.get("google_calendar_oauth_state")?.value;
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
        const token = await exchangeGoogleCodeForToken(code);

      if (!token.refresh_token) {
              return redirectComErro(
                        req,
                        "O Google nao retornou um refresh_token. Revogue o acesso do painel em myaccount.google.com/permissions e tente conectar de novo."
                      );
      }

      const email = await getGoogleUserEmail(token.access_token);

      const admin = createAdminClient();
        const { error: dbError } = await admin
          .from("profiles")
          .update({
                    google_calendar_refresh_token: token.refresh_token,
                    google_calendar_email: email,
                    google_calendar_connected_at: new Date().toISOString(),
          })
          .eq("id", user.id);

      if (dbError) {
              console.error("Erro ao salvar token do Google Calendar:", dbError);
              return redirectComErro(req, "Conta autorizada, mas houve erro ao salvar no banco.");
      }

      const response = NextResponse.redirect(new URL("/dashboard/calendario?conectado=1", req.url));
        response.cookies.delete("google_calendar_oauth_state");
        return response;
  } catch (err) {
        console.error("Erro no callback do Google Calendar:", err);
        return redirectComErro(req, "Erro ao concluir a autorizacao com o Google.");
  }
}

function redirectComErro(req: NextRequest, mensagem: string) {
    const url = new URL("/dashboard/calendario", req.url);
    url.searchParams.set("erro", mensagem);
    return NextResponse.redirect(url);
}
