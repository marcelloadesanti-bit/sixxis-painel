import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const modo = searchParams.get("modo") ?? "get";
  const siteId = searchParams.get("site") ?? "MLB";
  const campaignId = searchParams.get("campaign");
  const status = searchParams.get("status");

  if (!campaignId) {
    return NextResponse.json({ error: "informe ?campaign=ID na URL" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: contas } = await admin.from("ml_accounts").select("id").limit(1);
  const conta = contas?.[0];
  if (!conta) return NextResponse.json({ error: "no account" }, { status: 404 });

  const accessToken = await getValidAccessToken(conta.id);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const url = `https://api.mercadolibre.com/advertising/${siteId}/product_ads/campaigns/${campaignId}`;
    const res = await fetch(url, {
      method: modo === "put" ? "PUT" : "GET",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "api-version": "2",
        ...(modo === "put" ? { "Content-Type": "application/json" } : {}),
      },
      ...(modo === "put" ? { body: JSON.stringify({ status }) } : {}),
    });
    clearTimeout(timeout);
    const corpo = await res.text();
    return NextResponse.json({ url, status: res.status, corpo: corpo.slice(0, 1200) });
  } catch (err) {
    clearTimeout(timeout);
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
