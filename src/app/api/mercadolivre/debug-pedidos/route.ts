import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { periodoDeDatas } from "@/lib/mercadolivre/orders";

// Rota temporaria de diagnostico (somente admin) para inspecionar os campos
// brutos que a API do Mercado Livre retorna por pedido, e comparar diferentes
// campos de valor (total_amount, paid_amount, etc.) contra o total mostrado
// no painel do vendedor. Remover depois de identificar a causa da diferenca.
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "nao autenticado" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "somente admin" }, { status: 403 });
  }

  const de = req.nextUrl.searchParams.get("de");
  const ate = req.nextUrl.searchParams.get("ate");
  if (!de || !ate) {
    return NextResponse.json({ error: "informe de e ate (YYYY-MM-DD)" }, { status: 400 });
  }

  const { data: contas } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname")
    .limit(1);

  const conta = contas?.[0];
  if (!conta) {
    return NextResponse.json({ error: "nenhuma conta conectada" }, { status: 404 });
  }

  const accessToken = await getValidAccessToken(conta.id);
  const periodo = periodoDeDatas(de, ate);

  const params = new URLSearchParams({
    seller: String(conta.ml_user_id),
    "order.status": "paid",
    "order.date_created.from": periodo.desde,
    "order.date_created.to": periodo.ate,
    limit: "50",
    offset: "0",
  });

  const res = await fetch(`https://api.mercadolibre.com/orders/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const data = await res.json();

  const primeiraOrdem = data.results?.[0];

  const somaTotalAmount = (data.results ?? []).reduce(
    (s: number, o: { total_amount?: number }) => s + (o.total_amount ?? 0),
    0
  );
  const somaPaidAmount = (data.results ?? []).reduce(
    (s: number, o: { paid_amount?: number }) => s + (o.paid_amount ?? 0),
    0
  );

  return NextResponse.json({
    conta: conta.nickname,
    periodo,
    paging: data.paging,
    somaTotalAmountNestaPagina: somaTotalAmount,
    somaPaidAmountNestaPagina: somaPaidAmount,
    chavesDoPrimeiroPedido: primeiraOrdem ? Object.keys(primeiraOrdem) : [],
    primeiroPedidoCompleto: primeiraOrdem ?? null,
  });
}
