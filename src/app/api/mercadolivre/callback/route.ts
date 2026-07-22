import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "@/lib/mercadolivre/oauth";

// Endpoint que o Mercado Livre chama depois que o vendedor autoriza o app.
// Por enquanto so troca o code por token e mostra no log - o proximo passo
// e salvar esse token na tabela ml_accounts do Supabase, associado a conta.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "code ausente" }, { status: 400 });
  }

  const token = await exchangeCodeForToken(code);
  // TODO: salvar token no Supabase (tabela ml_accounts)
  console.log("Conta ML autorizada, user_id:", token.user_id);

  return NextResponse.redirect(new URL("/", req.url));
}
