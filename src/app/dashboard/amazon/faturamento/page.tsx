import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/amazon/token";
import { periodoDeDatas } from "@/lib/amazon/orders";
import { getFaturamento } from "@/lib/amazon/finances";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import AmazonContasFiltro from "../amazon-contas-filtro";

// A Finances API tambem tem rate limit apertado (ver nota em
// lib/amazon/finances.ts) -- mantem o timeout maior da Vercel Hobby.
export const maxDuration = 60;

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

const formatarMoeda = (valor: number, moeda: string | null) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda ?? "BRL",
  }).format(valor);

export default async function AmazonFaturamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; contas?: string }>;
}) {
  await exigirAcessoSecao("amazon", "amz_faturamento");
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const hoje = new Date();
  const de = params.de ?? formatarData(primeiroDiaDoMes(hoje));
  const ate = params.ate ?? formatarData(hoje);

  const periodo = periodoDeDatas(de, ate);

  const { data: contasBase } = await supabase
    .from("amazon_accounts")
    .select("id, seller_id, marketplace_id, nickname, apelido, cor")
    .order("nickname", { ascending: true });

  const todasContas = (contasBase ?? []).map((c) => ({
    id: c.id as string,
    nome: nomeConta(c),
    cor: (c.cor as string | null) ?? COR_PADRAO,
  }));

  const idsSelecionados = params.contas ? params.contas.split(",").filter(Boolean) : todasContas.map((c) => c.id);

  const contasParaBuscar = (contasBase ?? []).filter((c) => idsSelecionados.includes(c.id as string));

  const resultados = await Promise.all(
    contasParaBuscar.map(async (conta) => {
      const nome = nomeConta(conta);
      const cor = (conta.cor as string | null) ?? COR_PADRAO;
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const faturamento = await getFaturamento(accessToken, periodo);
        return { conta, nome, cor, faturamento, erro: null as string | null };
      } catch (err) {
        console.error(`Erro ao buscar faturamento Amazon de ${conta.nickname}:`, err);
        return {
          conta,
          nome,
          cor,
          faturamento: null,
          erro: "Falha ao buscar faturamento desta conta.",
        };
      }
    })
  );

  const totalVendas = resultados.reduce((soma, r) => soma + (r.faturamento?.totalVendas ?? 0), 0);
  const totalTarifas = resultados.reduce((soma, r) => soma + (r.faturamento?.totalTarifas ?? 0), 0);
  const totalReembolsos = resultados.reduce((soma, r) => soma + (r.faturamento?.totalReembolsos ?? 0), 0);
  const totalLiquido = resultados.reduce((soma, r) => soma + (r.faturamento?.totalLiquido ?? 0), 0);
  const moeda = resultados.find((r) => r.faturamento?.moeda)?.faturamento?.moeda ?? "BRL";
  const algumCortado = resultados.some((r) => r.faturamento?.cortado);

  const presets: { label: string; de: string; ate: string }[] = [
    { label: "Hoje", de: formatarData(hoje), ate: formatarData(hoje) },
    {
      label: "Últimos 7 dias",
      de: formatarData(new Date(Date.now() - 6 * 86400000)),
      ate: formatarData(hoje),
    },
    {
      label: "Últimos 30 dias",
      de: formatarData(new Date(Date.now() - 29 * 86400000)),
      ate: formatarData(hoje),
    },
    { label: "Este mês", de: formatarData(primeiroDiaDoMes(hoje)), ate: formatarData(hoje) },
    {
      label: "Mês passado",
      de: formatarData(primeiroDiaDoMesAnterior(hoje)),
      ate: formatarData(ultimoDiaDoMesAnterior(hoje)),
    },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/dashboard" className="text-sm text-[var(--color-sixxis-blue)] underline">
            ← Voltar ao painel
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Amazon · Faturamento</h1>
        </div>
      </div>

      <p className="mb-4 rounded border border-dashed border-gray-300 p-3 text-xs text-gray-500 dark:border-gray-700">
        Valores somados a partir dos eventos financeiros do período (vendas liquidadas, tarifas e
        reembolsos). Cobre os tipos de evento mais relevantes para o total — ajustes, cupons e taxas
        de serviços FBA ainda não entram na conta, então pode haver pequena diferença em relação ao
        extrato oficial da Amazon. Notas fiscais e relatórios continuam sendo emitidos direto no
        Seller Central.
      </p>

      <AmazonContasFiltro
        contas={todasContas}
        contasSelecionadas={idsSelecionados}
        baseHref="/dashboard/amazon/faturamento"
      />

      <form className="mb-4 flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4 dark:border-gray-700">
        <input type="hidden" name="contas" value={idsSelecionados.join(",")} />
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
              href={`/dashboard/amazon/faturamento?de=${p.de}&ate=${p.ate}&contas=${idsSelecionados.join(",")}`}
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
        {new Date(ate + "T00:00:00").toLocaleDateString("pt-BR")} (horário de Brasília)
      </p>

      {algumCortado && (
        <p className="mb-4 text-xs text-amber-600">
          Período com muitos eventos financeiros: os valores abaixo podem não cobrir 100% dos eventos
          do período selecionado. Tente um intervalo menor para maior precisão.
        </p>
      )}

      {resultados.some((r) => r.erro) && (
        <div className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600 dark:bg-red-950/40">
          Falha ao buscar faturamento de: {resultados.filter((r) => r.erro).map((r) => r.nome).join(", ")}. Os
          totais abaixo podem estar incompletos — tente novamente em alguns instantes.
        </div>
      )}

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase text-gray-400">Vendas brutas no período</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatarMoeda(totalVendas, moeda)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase text-gray-400">Tarifas no período</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatarMoeda(totalTarifas, moeda)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase text-gray-400">Reembolsos no período</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatarMoeda(totalReembolsos, moeda)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase text-gray-400">Faturamento líquido no período</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatarMoeda(totalLiquido, moeda)}</p>
        </div>
      </div>

      {resultados.length > 1 && (
        <div className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Por conta</h2>
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="p-3">Conta</th>
                  <th className="p-3 text-right">Vendas brutas</th>
                  <th className="p-3 text-right">Tarifas</th>
                  <th className="p-3 text-right">Reembolsos</th>
                  <th className="p-3 text-right">Líquido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {resultados.map((r) => (
                  <tr key={r.conta.id}>
                    <td className="p-3">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: r.cor }} />
                      {r.nome}
                    </td>
                    {r.erro || !r.faturamento ? (
                      <td colSpan={4} className="p-3 text-xs text-red-500">
                        {r.erro}
                      </td>
                    ) : (
                      <>
                        <td className="p-3 text-right">{formatarMoeda(r.faturamento.totalVendas, r.faturamento.moeda)}</td>
                        <td className="p-3 text-right">{formatarMoeda(r.faturamento.totalTarifas, r.faturamento.moeda)}</td>
                        <td className="p-3 text-right">{formatarMoeda(r.faturamento.totalReembolsos, r.faturamento.moeda)}</td>
                        <td className="p-3 text-right font-medium text-gray-900 dark:text-gray-100">
                          {formatarMoeda(r.faturamento.totalLiquido, r.faturamento.moeda)}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
