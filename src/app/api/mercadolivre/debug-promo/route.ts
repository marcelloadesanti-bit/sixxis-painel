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
      resultado[nome] = { status: res.status, corpo: corpo.slice(0, 600) };
    } catch (err) {
      resultado[nome] = { erro: String(err) };
    }
  }

  await testar(
    "com_marketplace_v2",
    `https://api.mercadolibre.com/marketplace/seller-promotions/users/${conta.ml_user_id}?limit=10`,
    { version: "v2" }
  );
  await testar(
    "sem_marketplace_v2",
    `https://api.mercadolibre.com/seller-promotions/users/${conta.ml_user_id}?limit=10`,
    { version: "v2" }
  );
  await testar(
    "sem_marketplace_sem_header",
    `https://api.mercadolibre.com/seller-promotions/users/${conta.ml_user_id}?limit=10`
  );
  await testar(
    "com_marketplace_sem_header",
    `https://api.mercadolibre.com/marketplace/seller-promotions/users/${conta.ml_user_id}?limit=10`
  );

  return NextResponse.json({ contaId: conta.id, mlUserId: conta.ml_user_id, resultado });
}
