import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getTotaisPorStatus, periodoDeDatas } from "@/lib/mercadolivre/orders";
import { getTotalVisitas } from "@/lib/mercadolivre/visits";
import { buscarVendasMlAmazon, somarItensVendas } from "@/lib/sige/vendas";

// Rota leve para as secoes "ao vivo" do Resumo: vendas de hoje (respeita o
// filtro de conta da pagina, so Mercado Livre -- a Amazon nao tem "vendas ao
// vivo" nesta fase) e progresso da meta do mes (sempre consolidado, todas as
// contas de AMBAS as plataformas, ignora o filtro -- a meta e da empresa
// como um todo). Feita para ser chamada com frequencia (polling do cliente,
// a cada 2 min).
export const maxDuration = 30;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const contasParam = searchParams.get("contas");
  const idsFiltro = contasParam ? contasParam.split(",").filter(Boolean) : null;

  const { data: todasContas } = await supabase.from("ml_accounts").select("id, ml_user_id");
  const listaContas = todasContas ?? [];
  const contasVendasHoje = idsFiltro ? listaContas.filter((c) => idsFiltro.includes(c.id)) : listaContas;

  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);
  const periodoHoje = periodoDeDatas(hojeStr, hojeStr);

  let vendasBrutas = 0;
  let quantidadeVendas = 0;
  let visualizacoes = 0;
  let moeda = "BRL";

  await Promise.all(
    contasVendasHoje.map(async (conta) => {
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const [pagas, canceladas, visitas] = await Promise.all([
          getTotaisPorStatus(accessToken, conta.ml_user_id, periodoHoje, "paid"),
          getTotaisPorStatus(accessToken, conta.ml_user_id, periodoHoje, "cancelled"),
          getTotalVisitas(accessToken, conta.ml_user_id, hojeStr, hojeStr),
        ]);
        vendasBrutas += pagas.valor + canceladas.valor;
        quantidadeVendas += pagas.quantidade + canceladas.quantidade;
        visualizacoes += visitas;
        if (pagas.moeda) moeda = pagas.moeda;
      } catch (err) {
        console.error(`Erro ao buscar vendas ao vivo de ${conta.id}:`, err);
      }
    })
  );

  const conversao = visualizacoes > 0 ? (quantidadeVendas / visualizacoes) * 100 : 0;

  // Meta do mes: sempre todas as contas de AMBAS as plataformas, do dia 1
  // ate hoje -- reaproveita a mesma lib de "faturamento liquido" (bruto -
  // cancelados - devolvidos) que ja alimenta Relatorios/Fechamento do SIGE,
  // para a meta nunca contar pedido cancelado/devolvido como se ja fosse
  // faturamento fechado (evita falsa sensacao de meta proxima).
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const primeiroDia = `${ano}-${String(mes).padStart(2, "0")}-01`;

  const itensMes = await buscarVendasMlAmazon(primeiroDia, hojeStr, null);
  const faturamentoMes = somarItensVendas(itensMes).faturamentoLiquido;

  const { data: metaRow } = await supabase
    .from("metas_mensais")
    .select("valor")
    .eq("ano", ano)
    .eq("mes", mes)
    .maybeSingle();

  return NextResponse.json({
    vendasHoje: { vendasBrutas, quantidadeVendas, visualizacoes, conversao, moeda },
    metaMes: {
      ano,
      mes,
      faturamento: faturamentoMes,
      metaValor: metaRow ? Number(metaRow.valor) : null,
      moeda,
    },
    ts: Date.now(),
  });
}
