import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { createAdminClient } from "@/lib/supabase/admin";

// TEMPORARIO -- diagnostico da divergencia de faturamento bruto de julho/2026
// na conta SIXXIS (GO): ML nativo mostra "Vendas brutas" R$220.941 (1
// cancelado de R$2.800, ja contado a parte no proprio painel do ML). Nosso
// sistema, filtrando por order.date_created dentro de julho, encontrou
// pagos=84/R$210.106,03 e cancelados=1/R$2.799,85 (soma R$212.905,88) --
// ainda assim ~R$8.035 abaixo do que o ML mostra.
//
// Hipotese: o widget "Vendas brutas" do proprio ML pode contar pela data de
// APROVACAO/FECHAMENTO do pedido (date_closed), nao pela data de CRIACAO
// (date_created) que usamos hoje -- um pedido criado no fim de junho mas
// pago/aprovado em julho apareceria no "Vendas brutas" de julho do ML, mas
// ficaria de fora do nosso filtro por date_created.
//
// Este debug: 1) tenta a mesma contagem usando order.date_closed no lugar de
// date_created; 2) lista pedidos PAGOS criados numa janela alargada
// (25/jun a 05/jul) com date_created E date_closed lado a lado, pra
// identificar visualmente quais pedidos "atravessam" a fronteira do mes.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ML_API = "https://api.mercadolibre.com";
const DESDE = "2026-07-01T00:00:00.000-03:00";
const ATE = "2026-07-31T23:59:59.999-03:00";
const JANELA_DESDE = "2026-06-25T00:00:00.000-03:00";
const JANELA_ATE = "2026-07-05T23:59:59.999-03:00";

type PedidoApi = { id: number; date_created: string; date_closed?: string | null; status: string; total_amount?: number };

async function contarPorCampo(token: string, sellerId: number, status: string, campo: "date_created" | "date_closed", desde: string, ate: string) {
  let offset = 0;
  let total = 0;
  let valor = 0;
  let paginas = 0;
  while (true) {
    const params = new URLSearchParams({
      seller: String(sellerId),
      "order.status": status,
      [`order.${campo}.from`]: desde,
      [`order.${campo}.to`]: ate,
      limit: "50",
      offset: String(offset),
    });
    const res = await fetch(`${ML_API}/orders/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) {
      return { campo, erro: `${res.status} ${await res.text()}` };
    }
    const data = (await res.json()) as { paging: { total: number }; results: PedidoApi[] };
    total = data.paging.total;
    for (const p of data.results) valor += p.total_amount ?? 0;
    offset += 50;
    paginas++;
    if (offset >= total || data.results.length === 0 || paginas > 25) break;
  }
  return { campo, quantidade: total, valor: Math.round(valor * 100) / 100 };
}

async function listarJanela(token: string, sellerId: number) {
  let offset = 0;
  let total = 0;
  const pedidos: { id: number; date_created: string; date_closed: string | null; total_amount: number }[] = [];
  let paginas = 0;
  while (true) {
    const params = new URLSearchParams({
      seller: String(sellerId),
      "order.status": "paid",
      "order.date_created.from": JANELA_DESDE,
      "order.date_created.to": JANELA_ATE,
      sort: "date_asc",
      limit: "50",
      offset: String(offset),
    });
    const res = await fetch(`${ML_API}/orders/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return { erro: `${res.status} ${await res.text()}` };
    const data = (await res.json()) as { paging: { total: number }; results: PedidoApi[] };
    total = data.paging.total;
    for (const p of data.results) {
      pedidos.push({
        id: p.id,
        date_created: p.date_created,
        date_closed: p.date_closed ?? null,
        total_amount: p.total_amount ?? 0,
      });
    }
    offset += 50;
    paginas++;
    if (offset >= total || data.results.length === 0 || paginas > 25) break;
  }
  return { pedidos };
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

  const [porCriacao, porFechamento, janela] = await Promise.all([
    contarPorCampo(token, sellerId, "paid", "date_created", DESDE, ATE),
    contarPorCampo(token, sellerId, "paid", "date_closed", DESDE, ATE),
    listarJanela(token, sellerId),
  ]);

  return NextResponse.json({ sellerId, porCriacao, porFechamento, janelaFronteira: janela });
}
