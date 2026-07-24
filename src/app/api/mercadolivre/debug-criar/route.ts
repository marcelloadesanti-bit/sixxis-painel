import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

// Rota temporaria de pesquisa (remover antes de fechar a feature de criacao).
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao autenticado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: contas } = await admin.from("ml_accounts").select("id, ml_user_id, nickname").limit(1);
  const conta = contas?.[0];
  if (!conta) return NextResponse.json({ erro: "sem conta conectada" }, { status: 400 });

  const accessToken = await getValidAccessToken(conta.id as string);
  const resultado: Record<string, unknown> = {};

  const modo = req.nextUrl.searchParams.get("modo") ?? "arvore";

  if (modo === "arvore") {
    const raiz = await fetch("https://api.mercadolibre.com/sites/MLB/categories").then((r) => r.json());
    resultado.raizAmostra = raiz.slice(0, 3);
    const filho = await fetch(`https://api.mercadolibre.com/categories/${raiz[0].id}`).then((r) => r.json());
    resultado.filhoAmostra = { id: filho.id, name: filho.name, children_categories: filho.children_categories?.slice(0, 3) };
  }

  if (modo === "atributos") {
    const catId = req.nextUrl.searchParams.get("cat") ?? "MLB1051"; // celulares, categoria folha conhecida
    const attrs = await fetch(`https://api.mercadolibre.com/categories/${catId}/attributes`).then((r) => r.json());
    resultado.totalAtributos = attrs.length;
    resultado.amostra = attrs.slice(0, 6);
    resultado.obrigatorios = attrs
      .filter((a: any) => a.tags?.required)
      .map((a: any) => ({ id: a.id, name: a.name, value_type: a.value_type, tags: a.tags, values: a.values?.slice(0, 5) }));
  }

  if (modo === "predict") {
    const titulo = req.nextUrl.searchParams.get("titulo") ?? "Bicicleta Spinning Sixxis";
    const pred = await fetch(
      `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=3&q=${encodeURIComponent(titulo)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ).then((r) => r.json());
    resultado.predicao = pred;
  }

  if (modo === "upload") {
    // Testa o endpoint de upload de imagem via URL publica conhecida (sem gastar cota de verdade se possivel)
    const imgUrl = req.nextUrl.searchParams.get("url");
    if (imgUrl) {
      const imgResp = await fetch(imgUrl);
      const buffer = await imgResp.arrayBuffer();
      const blob = new Blob([buffer], { type: imgResp.headers.get("content-type") ?? "image/jpeg" });
      const form = new FormData();
      form.append("file", blob, "teste.jpg");
      const up = await fetch("https://api.mercadolibre.com/pictures/items/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
        body: form,
      });
      const upData = await up.json().catch(() => null);
      resultado.status = up.status;
      resultado.resposta = upData;
    } else {
      resultado.aviso = "passe ?url=<imagem publica> para testar upload";
    }
  }

  return NextResponse.json(resultado);
}
