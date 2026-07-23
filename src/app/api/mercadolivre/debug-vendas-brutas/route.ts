import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

const ML_API = "https://api.mercadolibre.com";

type PedidoApi = {
  id: number;
  date_created: string;
  date_closed?: string;
  status: string;
  total_amount: number;
  paid_amount?: number;
  currency_id: string;
};

async function buscarTudo(
  accessToken: string,
  mlUserId: number,
  params: Record<string, string>
): Promise<PedidoApi[]> {
  const pedidos: PedidoApi[] = [];
  let offset = 0;
  let total = 0;
  for (let i = 0; i < 20; i++) {
    const sp = new URLSearchParams({
      seller: String(mlUserId),
      limit: "50",
      offset: String(offset),
      ...params,
    });
    const res = await fetch(`${ML_API}/orders/search?${sp.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`orders/search falhou: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { paging: { total: number }; results: PedidoApi[] };
    total = data.paging.total;
    pedidos.push(...data.results);
    offset += 50;
    if (offset >= total || data.results.length === 0) break;
  }
  return pedidos;
}

function resumo(pedidos: PedidoApi[], usarPaidAmount: boolean) {
  const quantidade = pedidos.length;
  const valor = pedidos.reduce(
    (s, p) => s + (usarPaidAmount ? p.paid_amount ?? p.total_amount ?? 0 : p.total_amount ?? 0),
    0
  );
  return { quantidade, valor: Math.round(valor * 100) / 100 };
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const de = searchParams.get("de") ?? "2026-06-24";
  const ate = searchParams.get("ate") ?? "2026-07-23";
  const desde = `${de}T00:00:00.000-03:00`;
  const atehora = `${ate}T23:59:59.999-03:00`;

  const admin = createAdminClient();
  const { data: contas } = await admin.from("ml_accounts").select("id, ml_user_id, nickname").limit(1);
  const conta = contas?.[0];
  if (!conta) return NextResponse.json({ error: "no account" }, { status: 404 });

  const accessToken = await getValidAccessToken(conta.id);

  const [pagasPorCriacao, canceladasPorCriacao] = await Promise.all([
    buscarTudo(accessToken, conta.ml_user_id, {
      "order.status": "paid",
      "order.date_created.from": desde,
      "order.date_created.to": atehora,
    }),
    buscarTudo(accessToken, conta.ml_user_id, {
      "order.status": "cancelled",
      "order.date_created.from": desde,
      "order.date_created.to": atehora,
    }),
  ]);

  let pagasPorFechamento: PedidoApi[] = [];
  let erroFechamento: string | null = null;
  try {
    pagasPorFechamento = await buscarTudo(accessToken, conta.ml_user_id, {
      "order.status": "paid",
      "order.date_closed.from": desde,
      "order.date_closed.to": atehora,
    });
  } catch (e) {
    erroFechamento = String(e);
  }

  return NextResponse.json({
    periodo: { de, ate, desde, atehora },
    referenciaPainelMercadoLivre: {
      vendasBrutas: 256552,
      quantidadeVendas: 101,
      valorCancelado: 10441,
      quantidadeCancelada: 4,
    },
    hipoteses: {
      A_paid_dateCreated_paidAmount: resumo(pagasPorCriacao, true),
      B_paid_dateCreated_totalAmount: resumo(pagasPorCriacao, false),
      C_paidMaisCancelado_dateCreated: {
        quantidade: pagasPorCriacao.length + canceladasPorCriacao.length,
        valor: resumo(pagasPorCriacao, true).valor + resumo(canceladasPorCriacao, false).valor,
      },
      D_paid_dateClosed_paidAmount: erroFechamento
        ? { erro: erroFechamento }
        : resumo(pagasPorFechamento, true),
      cancelado_dateCreated: resumo(canceladasPorCriacao, false),
    },
  });
}
