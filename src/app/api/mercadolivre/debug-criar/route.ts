import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao autenticado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: contas } = await admin.from("ml_accounts").select("id, ml_user_id, nickname").limit(1);
  const conta = contas?.[0];
  if (!conta) return NextResponse.json({ erro: "sem conta conectada" }, { status: 400 });
  const accessToken = await getValidAccessToken(conta.id as string);

  try {
    // imagem publica de teste pequena
    const imgUrl = "https://http2.mlstatic.com/storage/categories-api/images/6fc20d84-2ce6-44ee-8e7e-e5479a78eab0.png";
    const imgResp = await fetch(imgUrl);
    const buffer = await imgResp.arrayBuffer();
    const blob = new Blob([buffer], { type: imgResp.headers.get("content-type") ?? "image/png" });
    const form = new FormData();
    form.append("file", blob, "teste.png");

    const up = await fetch("https://api.mercadolibre.com/pictures/items/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    const texto = await up.text();
    let corpo: unknown = texto;
    try { corpo = JSON.parse(texto); } catch {}

    return NextResponse.json({ status: up.status, ok: up.ok, corpo });
  } catch (err) {
    return NextResponse.json({ erroFetch: String(err) }, { status: 500 });
  }
}
