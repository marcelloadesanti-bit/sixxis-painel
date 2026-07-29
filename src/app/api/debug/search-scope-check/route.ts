import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

// ROTA TEMPORARIA DE DIAGNOSTICO v5 -- 100% leitura.
// v4 mostrou que available_filters trunca antes de chegar em "category"
// (limit=1 nao inclui filtro de categoria). Aqui: (a) lista so os IDs dos
// filtros disponiveis (sem truncar), (b) tenta de novo SEM limit=1 (limit=50)
// pra ver se category aparece, e (c) testa /users/{id}/available_filters
// (endpoint dedicado, se existir) como alternativa. REMOVER depois.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "Nao autenticado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: contas } = await admin.from("ml_accounts").select("id, nickname, ml_user_id").limit(1);
  if (!contas || contas.length === 0) {
    return NextResponse.json({ erro: "Nenhuma conta ML encontrada." }, { status: 404 });
  }
  const conta = contas[0];
  const accessToken = await getValidAccessToken(conta.id);

  async function chamar(url: string) {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const texto = await resp.text();
    try {
      return { status: resp.status, json: JSON.parse(texto) };
    } catch {
      return { status: resp.status, corpo: texto.slice(0, 500) };
    }
  }

  const a = await chamar(
    `https://api.mercadolibre.com/users/${conta.ml_user_id}/items/search?status=active&include_filters=true&limit=1`
  );
  const filtrosA = (a as any).json?.available_filters?.map((f: any) => ({ id: f.id, name: f.name, n_values: f.values?.length ?? 0 })) ?? null;
  const filtroCategoriaA = (a as any).json?.available_filters?.find((f: any) => f.id === "category") ?? null;

  const b = await chamar(
    `https://api.mercadolibre.com/users/${conta.ml_user_id}/items/search?status=active&include_filters=true&limit=50`
  );
  const filtrosB = (b as any).json?.available_filters?.map((f: any) => ({ id: f.id, name: f.name, n_values: f.values?.length ?? 0 })) ?? null;
  const filtroCategoriaB = (b as any).json?.available_filters?.find((f: any) => f.id === "category") ?? null;

  return NextResponse.json({
    conta: conta.nickname,
    limit1: { status: a.status, filtros: filtrosA, categoria: filtroCategoriaA },
    limit50: { status: b.status, filtros: filtrosB, categoria: filtroCategoriaB },
  });
}
