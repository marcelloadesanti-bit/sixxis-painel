import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getVendas, agruparPorHorario, periodoDeDatas, type Pedido } from "@/lib/mercadolivre/orders";
import { getVendasPorEstadoComCache } from "@/lib/mercadolivre/estado-cache";
import { getMaisVendidosPorSku, type RankingSku } from "@/lib/mercadolivre/items";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import MetricasVendasView from "../metricas-vendas-view";

// Subpagina dedicada de Metricas (30/07/2026) -- mesma secao que ja aparece
// no Resumo de Vendas, so que aqui e o unico conteudo da pagina, com espaco
// para crescer (mais graficos/quebras) sem lotar o Resumo. Reaproveita o
// mesmo componente de apresentacao (MetricasVendasView) e a mesma logica de
// cache de estado (getVendasPorEstadoComCache) do Resumo.
export const maxDuration = 300;

function formatarData(d: Date) {
  return d.toISOString().slice(0, 10);
}
function primeiroDiaDoMes(ref: Date) {
  return new Date(ref.getFullYear(), ref.getMonth(), 1);
}
function ultimoDiaDoMesAnterior(ref: Date) {
  return new Date(ref.getFullYear(), ref.getMonth(), 0);
}
function primeiroDiaDoMesAnterior(ref: Date) {
  return new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
}

export default async function MetricasVendasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; conta?: string }>;
}) {
  await exigirAcessoSecao("vendas");
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const hoje = new Date();
  const de = params.de ?? formatarData(primeiroDiaDoMes(hoje));
  const ate = params.ate ?? formatarData(hoje);
  const filtroConta = params.conta ?? "todas";
  const periodo = periodoDeDatas(de, ate);

  const { data: contasBase } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname, apelido, cor")
    .order("nickname", { ascending: true });

  const contasParaBuscar = (contasBase ?? []).filter(
    (c) => filtroConta === "todas" || c.id === filtroConta
  );

  const resultados = await Promise.all(
    contasParaBuscar.map(async (conta) => {
      const nome = nomeConta(conta);
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const vendas = await getVendas(accessToken, conta.ml_user_id, periodo, conta.id, nome);
        return { conta, nome, vendas, accessToken, erro: null as string | null };
      } catch (err) {
        console.error(`Erro ao buscar vendas de ${conta.nickname} (Metricas):`, err);
        return { conta, nome, vendas: null, accessToken: null as string | null, erro: "Falha ao buscar esta conta." };
      }
    })
  );

  const tokensPorConta = new Map<string, string>();
  for (const r of resultados) {
    if (r.accessToken) tokensPorConta.set(r.conta.id, r.accessToken);
  }

  const todosPedidos: Pedido[] = resultados
    .flatMap((r) => r.vendas?.pedidos ?? [])
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime());

  const horario = agruparPorHorario(todosPedidos);

  const pedidosPorContaTodos = new Map<string, { id: number; dataCriacao: string }[]>();
  for (const p of todosPedidos) {
    if (!pedidosPorContaTodos.has(p.contaId)) pedidosPorContaTodos.set(p.contaId, []);
    pedidosPorContaTodos.get(p.contaId)!.push({ id: p.id, dataCriacao: p.dataCriacao });
  }
  let vendasPorEstado: { estado: string; quantidade: number }[] = [];
  let estadoAmostraParcial = false;
  let estadoResolvidoTotal = 0;
  try {
    const resultadoEstado = await getVendasPorEstadoComCache(supabase, pedidosPorContaTodos, tokensPorConta);
    vendasPorEstado = resultadoEstado.porEstado;
    estadoAmostraParcial = resultadoEstado.amostraParcial;
    estadoResolvidoTotal = resultadoEstado.totalResolvidos;
  } catch (err) {
    console.error("Erro ao agregar vendas por estado (Metricas):", err);
  }

  const rankingPorSkuPorConta = await Promise.all(
    resultados.map(async (r) => {
      if (!r.accessToken || !r.vendas?.porProduto?.length) return [] as RankingSku[];
      const produtosConta = [...r.vendas.porProduto].sort((a, b) => b.quantidade - a.quantidade).slice(0, 30);
      try {
        return await getMaisVendidosPorSku(r.accessToken, produtosConta);
      } catch (err) {
        console.error(`Erro ao buscar SKU dos produtos vendidos de ${r.nome} (Metricas):`, err);
        return [] as RankingSku[];
      }
    })
  );
  const porSkuConsolidado = new Map<string, RankingSku>();
  for (const lista of rankingPorSkuPorConta) {
    for (const item of lista) {
      const atual = porSkuConsolidado.get(item.sku);
      if (atual) {
        atual.quantidade += item.quantidade;
        atual.valor += item.valor;
      } else {
        porSkuConsolidado.set(item.sku, { ...item });
      }
    }
  }
  const maisVendidosPorSku = Array.from(porSkuConsolidado.values()).sort((a, b) => b.quantidade - a.quantidade);

  const presets: { label: string; de: string; ate: string }[] = [
    { label: "Hoje", de: formatarData(hoje), ate: formatarData(hoje) },
    { label: "Últimos 7 dias", de: formatarData(new Date(Date.now() - 6 * 86400000)), ate: formatarData(hoje) },
    { label: "Últimos 30 dias", de: formatarData(new Date(Date.now() - 29 * 86400000)), ate: formatarData(hoje) },
    { label: "Este mês", de: formatarData(primeiroDiaDoMes(hoje)), ate: formatarData(hoje) },
    {
      label: "Mês passado",
      de: formatarData(primeiroDiaDoMesAnterior(hoje)),
      ate: formatarData(ultimoDiaDoMesAnterior(hoje)),
    },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <div className="mb-6">
        <Link href="/dashboard/vendas" className="text-sm text-[var(--color-sixxis-blue)] underline">
          ← Voltar a Vendas
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Métricas de vendas</h1>
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4 dark:border-gray-700">
        <div>
          <label className="mb-1 block text-xs text-gray-500">De</label>
          <input
            type="date"
            name="de"
            defaultValue={de}
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Até</label>
          <input
            type="date"
            name="ate"
            defaultValue={ate}
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Conta</label>
          <select
            name="conta"
            defaultValue={filtroConta}
            className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
          >
            <option value="todas">Todas as contas</option>
            {(contasBase ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {nomeConta(c)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded bg-[var(--color-sixxis-navy)] px-4 py-1.5 text-sm font-medium text-white"
        >
          Aplicar
        </button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        {presets.map((p) => {
          const ativo = p.de === de && p.ate === ate;
          return (
            <Link
              key={p.label}
              href={`/dashboard/vendas/metricas?de=${p.de}&ate=${p.ate}&conta=${filtroConta}`}
              className={`rounded-full px-3 py-1.5 text-sm ${
                ativo
                  ? "bg-[var(--color-sixxis-navy)] text-white"
                  : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              }`}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      <p className="mb-4 text-xs text-gray-400">
        Período: {new Date(de + "T00:00:00").toLocaleDateString("pt-BR")} até{" "}
        {new Date(ate + "T00:00:00").toLocaleDateString("pt-BR")} (horário de Brasília) · {todosPedidos.length}{" "}
        pedido(s) pagos no período
      </p>

      <MetricasVendasView
        horario={horario}
        vendasPorEstado={vendasPorEstado}
        estadoAmostraParcial={estadoAmostraParcial}
        estadoResolvidoTotal={estadoResolvidoTotal}
        estadoTotalPeriodo={todosPedidos.length}
        maisVendidosPorSku={maisVendidosPorSku}
      />
    </main>
  );
}
