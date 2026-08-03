import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { createAdminClient } from "@/lib/supabase/admin";

// TEMPORARIO -- diagnostico da divergencia de faturamento bruto de julho/2026
// na conta SIXXIS (GO): ML nativo mostra R$220.941 (vendas brutas, com 1
// cancelado de R$2.800 ja contado a parte); nosso painel mostrou R$210.106.
// Investiga contando pedidos/valor por STATUS (nao so paid/cancelled) no
// periodo, pra achar onde os ~R$10.835 que faltam estao "escondidos".
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ML_API = "https://api.mercadolibre.com";
const DESDE = "2026-07-01T00:00:00.000-03:00";
const ATE = "2026-07-31T23:59:59.999-03:00";
const STATUSES = ["paid", "cancelled", "invalid", "confirmed", "payment_required", "partially_paid", "pending"];

async function contarStatus(token: string, sellerId: number, status: string) {
  let offset = 0;
  let total = 0;
  let valor = 0;
  let paginas = 0;
  while (true) {
    const params = new URLSearchParams({
      seller: String(sellerId),
      "order.status": status,
      "order.date_created.from": DESDE,
      "order.date_created.to": ATE,
      limit: "50",
      offset: String(offset),
    });
    const res = await fetch(`${ML_API}/orders/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return { status, erro: `${res.status} ${await res.text()}` };
    }
    const data = (await res.json()) as {
      paging: { total: number };
      results: { total_amount?: number }[];
    };
    total = data.paging.total;
    for (const p of data.results) valor += p.total_amount ?? 0;
    offset += 50;
    paginas++;
    if (offset >= total || data.results.length === 0 || paginas > 25) break;
  }
  return { status, quantidade: total, valor: Math.round(valor * 100) / 100 };
}

export async function GET() {
  const admin = createAdminClient();
  const { data: conta } = await admin
    .from("ml_accounts")
    .select("id, ml_user_id")
    .eq("apelido", "SIXXIS (GO)")
    .maybeSingle();

  if (!conta) return NextResponse.json({ erro: "Conta GO nao encontrada." }, { status: 404 });

  const token = await getValidAccessToken(conta.id as string);
  const sellerId = conta.ml_user_id as number;

  const resultados = await Promise.all(STATUSES.map((s) => contarStatus(token, sellerId, s)));

  return NextResponse.json({ sellerId, periodo: { DESDE, ATE }, resultados });
}
