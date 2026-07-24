import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "nao autenticado" }, { status: 401 });

  const admin = createAdminClient();
  const { data: contas } = await admin.from("ml_accounts").select("id, ml_user_id, nickname").limit(1);
  const conta = contas?.[0];
  if (!conta) return NextResponse.json({ erro: "sem conta conectada" }, { status: 400 });

  const accessToken = await getValidAccessToken(conta.id as string);

  return NextResponse.json({ ok: true, conta: conta.nickname, temToken: Boolean(accessToken) });
}
