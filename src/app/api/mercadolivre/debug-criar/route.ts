import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao autenticado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: contas } = await admin.from("ml_accounts").select("id").limit(1);
  const conta = contas?.[0];
  if (!conta) return NextResponse.json({ erro: "sem conta" }, { status: 400 });
  const accessToken = await getValidAccessToken(conta.id as string);

  const titulo = req.nextUrl.searchParams.get("titulo") ?? "Climatizador de ar portatil 45l residencial 110";

  try {
    const resp = await fetch(
      `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=5&q=${encodeURIComponent(titulo)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const texto = await resp.text();
    let corpo: unknown = texto;
    try { corpo = JSON.parse(texto); } catch {}
    return NextResponse.json({ status: resp.status, ok: resp.ok, corpo });
  } catch (err) {
    return NextResponse.json({ erroFetch: String(err) }, { status: 500 });
  }
}
