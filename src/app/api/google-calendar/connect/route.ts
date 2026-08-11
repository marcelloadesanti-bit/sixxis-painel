import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildGoogleAuthorizationUrl } from "@/lib/google/calendar-oauth";
import { createClient } from "@/lib/supabase/server";

// Inicia a autorizacao do Google Calendar para o usuario logado. Qualquer
// usuario com acesso a secao Calendario pode conectar o proprio Gmail --
// diferente da conexao de contas ML/Amazon (que e por conta da empresa),
// aqui e por pessoa.
export async function GET(req: NextRequest) {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();

  if (!user) {
        return NextResponse.redirect(new URL("/login", req.url));
  }

  const state = randomBytes(16).toString("hex");

  const response = NextResponse.redirect(buildGoogleAuthorizationUrl(state));
    response.cookies.set("google_calendar_oauth_state", state, {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          maxAge: 60 * 10,
          path: "/",
    });
    return response;
}
