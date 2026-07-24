import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

async function chamar(url: string, accessToken: string) {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const texto = await resp.text();
  let corpo: unknown = texto;
  try { corpo = JSON.parse(texto); } catch {}
  return { status: resp.status, ok: resp.ok, corpo };
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao autenticado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: contas } = await admin.from("ml_accounts").select("id, ml_user_id, nickname").limit(1);
  const conta = contas?.[0];
  if (!conta) return NextResponse.json({ erro: "sem conta conectada" }, { status: 400 });
  const accessToken = await getValidAccessToken(conta.id as string);

  const modo = req.nextUrl.searchParams.get("modo") ?? "arvore";
  const resultado: Record<string, unknown> = {};

  try {
    if (modo === "arvore") {
      resultado.raiz = await chamar("https://api.mercadolibre.com/sites/MLB/categories", accessToken);
      const raizCorpo = (resultado.raiz as any).corpo;
      if (Array.isArray(raizCorpo) && raizCorpo[0]) {
        resultado.filho = await chamar(`https://api.mercadolibre.com/categories/${raizCorpo[0].id}`, accessToken);
      }
    }

    if (modo === "atributos") {
      const catId = req.nextUrl.searchParams.get("cat") ?? "MLB1051";
      resultado.atributos = await chamar(`https://api.mercadolibre.com/categories/${catId}/attributes`, accessToken);
    }

    if (modo === "predict") {
      const titulo = req.nextUrl.searchParams.get("titulo") ?? "Bicicleta Spinning Sixxis";
      resultado.predicao = await chamar(
        `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=3&q=${encodeURIComponent(titulo)}`,
        accessToken
      );
    }

    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json({ erroFetch: String(err) }, { status: 500 });
  }
}
