// ROTA TEMPORARIA DE DEBUG (27/07/2026) -- a UI de notas fiscais em produção
// mostrou todas as datas de vencimento como "30/12/9999" e todos os PDFs como
// "indisponível". Antes de ajustar o mapeamento em billing.ts (nomes de
// campo, lógica de escolha do arquivo PDF), inspeciona o JSON bruto que a
// API de documents devolve para confirmar os nomes reais dos campos.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

const ML_API = "https://api.mercadolibre.com";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nickname = searchParams.get("conta");
  const periodoKey = searchParams.get("periodo");

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

    let key = periodoKey;
    if (!key) {
      const paramsPeriodos = new URLSearchParams({ group: "ML", document_type: "BILL", limit: "1" });
      const resPeriodos = await fetch(`${ML_API}/billing/integration/monthly/periods?${paramsPeriodos.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const periodos = await resPeriodos.json();
      key = periodos?.results?.[0]?.key;
      if (!key) {
        return NextResponse.json({ conta: conta.nickname, periodos }, { status: 200 });
      }
    }

    const paramsDocs = new URLSearchParams({ group: "ML", limit: "150" });
    const resDocs = await fetch(`${ML_API}/billing/integration/periods/key/${key}/documents?${paramsDocs.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const status = resDocs.status;
    const docsBruto = await resDocs.json();

    return NextResponse.json({
      conta: conta.nickname,
      periodoKey: key,
      status,
      docsBruto,
    });
  } catch (err) {
    return NextResponse.json(
      { erro: err instanceof Error ? err.message : "Falha desconhecida" },
      { status: 500 }
    );
  }
}
