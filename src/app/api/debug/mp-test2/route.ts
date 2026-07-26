// ROTA TEMPORARIA DE DIAGNOSTICO -- NAO FAZ PARTE DA FEATURE.
// Objetivo: repetir o teste de auth Mercado Pago com uma segunda conta
// (diferente da BRASILSIXXIS) para confirmar se o 404 encontrado antes
// e especifico daquela conta ou do app inteiro.
// Sera removida assim que a validacao terminar.
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { token } = (await request.json().catch(() => ({}))) as { token?: string };
  if (!token) {
    return NextResponse.json({ error: "token obrigatorio no body" }, { status: 400 });
  }

  const resultado: Record<string, unknown> = {};

  try {
    const r1 = await fetch("https://api.mercadolibre.com/billing/integration/periods?group=ML&document_type=BILL&limit=2", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body1 = await r1.text();
    resultado.ml_billing_periods = { status: r1.status, body: body1.slice(0, 500) };
  } catch (err) {
    resultado.ml_billing_periods = { error: String(err) };
  }

  try {
    const r2 = await fetch("https://api.mercadopago.com/v1/account/settlement_report", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ begin_date: "2026-06-01T00:00:00Z", end_date: "2026-06-30T23:59:59Z" }),
    });
    const body2 = await r2.text();
    resultado.mp_settlement_report = { status: r2.status, body: body2.slice(0, 500) };
  } catch (err) {
    resultado.mp_settlement_report = { error: String(err) };
  }

  console.log("DEBUG mp-test-2 resultado:", JSON.stringify(resultado));
  return NextResponse.json(resultado);
}
