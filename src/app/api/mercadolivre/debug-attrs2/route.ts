import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

export async function GET(req: NextRequest) {
  try {
    const admin = createAdminClient();
    const { data: contas } = await admin.from("ml_accounts").select("id").limit(1);
    const conta = contas?.[0];
    if (!conta) return NextResponse.json({ erro: "sem conta" });
    const token = await getValidAccessToken(conta.id as string);

    const dd = await fetch(
      `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=1&q=${encodeURIComponent("Bicicleta Ergometrica Spinning 16kg")}`,
      { headers: { Authorization: `Bearer ${token}` } }
    ).then((r) => r.json());
    const catId = dd[0]?.category_id;

    const attrsResp = await fetch(`https://api.mercadolibre.com/categories/${catId}/attributes`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const attrs = await attrsResp.json();

    const total = attrs.length;
    const visiveis = attrs.filter((a: any) => !a.tags?.hidden && !a.tags?.read_only);
    const ocultos = attrs.filter((a: any) => a.tags?.hidden || a.tags?.read_only);

    const pacote = attrs.filter((a: any) => a.id.startsWith("SELLER_PACKAGE_"));

    return NextResponse.json({
      categoria: catId,
      total,
      visiveisCount: visiveis.length,
      ocultosCount: ocultos.length,
      pacote: pacote.map((a: any) => ({ id: a.id, name: a.name, value_type: a.value_type, tags: a.tags, hint: a.hint })),
    });
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : String(err) });
  }
}
