import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { buildAuthorizationUrl } from "@/lib/mercadolivre/oauth";
import { createClient } from "@/lib/supabase/server";
import { podeEditar, type PermissoesUsuario } from "@/lib/permissoes";

// Inicia a autorizacao de uma conta Mercado Livre.
// So o admin master ou um administrador com edicao em "contas" pode iniciar
// essa conexao.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissoes")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin";
  const permissoes = (profile?.permissoes as PermissoesUsuario) ?? {};

  if (!podeEditar(isAdmin, permissoes, "contas")) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  // Estado aleatorio para protecao CSRF - validado de volta no /callback.
  const state = randomBytes(16).toString("hex");

  const response = NextResponse.redirect(buildAuthorizationUrl(state));
  response.cookies.set("ml_oauth_state", state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 10, // 10 minutos para completar o fluxo
    path: "/",
  });
  return response;
}
