import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get("q") ?? "detector de metal";
    const admin = createAdminClient();
    const { data: contas } = await admin.from("ml_accounts").select("id").limit(1);
    const conta = contas?.[0];
    if (!conta) return NextResponse.json({ erro: "sem conta" });
    const token = await getValidAccessToken(conta.id as string);
    const resp = await fetch(`https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(q)}&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const texto = await resp.text();
    return NextResponse.json({ status: resp.status, body: texto.slice(0, 800) });
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : null });
  }
}
