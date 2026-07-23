import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: contas } = await admin
    .from("ml_accounts")
    .select("id, ml_user_id, nickname")
    .limit(1);

  const conta = contas?.[0];
  if (!conta) return NextResponse.json({ error: "no account" }, { status: 404 });

  const accessToken = await getValidAccessToken(conta.id);
  const resultado: Record<string, unknown> = {};

  async function testar(nome: string, url: string, headers: Record<string, string> = {}) {
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}`, ...headers } });
      const corpo = await res.text();
      resultado[nome] = { status: res.status, corpo: corpo.slice(0, 800) };
    } catch (err) {
      resultado[nome] = { erro: String(err) };
    }
  }

  await testar(
    "questions",
    `https://api.mercadolibre.com/questions/search?seller_id=${conta.ml_user_id}&status=UNANSWERED&api_version=4&limit=5&offset=0`
  );
  await testar("messages_unread", `https://api.mercadolibre.com/messages/unread?role=seller`);
  await testar(
    "claims",
    `https://api.mercadolibre.com/post-purchase/v1/claims/search?players.user_id=${conta.ml_user_id}&players.role=respondent&status=opened&limit=5`
  );

  return NextResponse.json({ contaId: conta.id, mlUserId: conta.ml_user_id, resultado });
}
