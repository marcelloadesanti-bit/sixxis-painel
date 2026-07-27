// ROTA TEMPORARIA DE DEBUG (27/07/2026) -- remover depois de inspecionar o
// JSON bruto da API de Faturamento para descobrir se existe um campo que
// classifica os encargos em categorias legiveis (o painel oficial do ML
// agrupa em "Tarifas de venda", "Tarifas de envios", etc., mas nosso
// /summary/details devolve so codigos crus como CVVML, CFONPN). Nao chuta o
// significado dos codigos -- so inspeciona o dado real antes de decidir como
// mapear.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

const ML_API = "https://api.mercadolibre.com";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nickname = searchParams.get("conta");

  const admin = createAdminClient();
  let query = admin.from("ml_accounts").select("id, ml_user_id, nickname").limit(1);
  if (nickname) {
    query = admin.from("ml_accounts").select("id, ml_user_id, nickname").ilike("nickname", `%${nickname}%`).limit(1);
  }
  const { data: contas, error: erroContas } = await query;
  if (erroContas || !contas || contas.length === 0) {
    return NextResponse.json({ erro: "Conta nao encontrada", erroContas }, { status: 404 });
  }
  const conta = contas[0];

  try {
    const accessToken = await getValidAccessToken(conta.id as string);

    const paramsPeriodos = new URLSearchParams({ group: "ML", document_type: "BILL", limit: "1" });
    const resPeriodos = await fetch(`${ML_API}/billing/integration/monthly/periods?${paramsPeriodos.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const periodos = await resPeriodos.json();
    const key = periodos?.results?.[0]?.key;

    if (!key) {
      return NextResponse.json({ conta: conta.nickname, periodos }, { status: 200 });
    }

    const paramsResumo = new URLSearchParams({ group: "ML", document_type: "BILL" });
    const resResumo = await fetch(
      `${ML_API}/billing/integration/periods/key/${key}/summary/details?${paramsResumo.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const resumoBruto = await resResumo.json();

    return NextResponse.json({
      conta: conta.nickname,
      periodoKey: key,
      periodos,
      resumoBruto,
    });
  } catch (err) {
    return NextResponse.json(
      { erro: err instanceof Error ? err.message : "Falha desconhecida" },
      { status: 500 }
    );
  }
}
