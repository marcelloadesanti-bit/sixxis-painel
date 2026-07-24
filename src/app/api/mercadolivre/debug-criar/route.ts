import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao autenticado" }, { status: 401 });

  try {
    const resp = await fetch("https://api.mercadolibre.com/sites/MLB/categories");
    const texto = await resp.text();
    return NextResponse.json({
      status: resp.status,
      ok: resp.ok,
      contentType: resp.headers.get("content-type"),
      tamanho: texto.length,
      amostra: texto.slice(0, 500),
    });
  } catch (err) {
    return NextResponse.json({ erroFetch: String(err), stack: err instanceof Error ? err.stack : null }, { status: 500 });
  }
}
