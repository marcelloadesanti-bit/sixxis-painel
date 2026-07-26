// ROTA TEMPORARIA DE DIAGNOSTICO -- NAO FAZ PARTE DA FEATURE.
// Objetivo unico: validar se o access_token OAuth do Mercado Livre que ja
// usamos (ml_accounts.access_token) tambem e aceito pela API do Mercado
// Pago (api.mercadopago.com), ou se exige uma autorizacao/app separada.
// Sera removida assim que a validacao terminar.
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const { token } = (await request.json().catch(() => ({}))) as { token?: string };
  if (!token) {
    return NextResponse.json({ error: "token obrigatorio no body" }, { status: 400 });
  }

  const resultado: Record<string, unknown> = {};

  // Teste 1: sanity check -- endpoint que sabemos que funciona (ML Billing Reports)
  try {
    const r1 = await fetch("https://api.mercadolibre.com/billing/integration/periods?group=ML&document_type=BILL&limit=2", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body1 = await r1.text();
    resultado.ml_billing_periods = { status: r1.status, body: body1.slice(0, 500) };
  } catch (err) {
    resultado.ml_billing_periods = { error: String(err) };
  }

  // Teste 2: Mercado Pago settlement_report (POST) -- o que queremos validar
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

  // Teste 3: Mercado Pago balance direto (sabemos que costuma ser bloqueado, mas confirma)
  try {
    const r3 = await fetch("https://api.mercadopago.com/v1/account/bank_report", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body3 = await r3.text();
    resultado.mp_bank_report = { status: r3.status, body: body3.slice(0, 500) };
  } catch (err) {
    resultado.mp_bank_report = { error: String(err) };
  }

  console.log("DEBUG mp-test resultado:", JSON.stringify(resultado));
  return NextResponse.json(resultado);
}
