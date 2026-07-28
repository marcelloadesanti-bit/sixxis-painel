import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/amazon/token";
import { getVendas, periodoDeDatas, classificarCancelados, type PedidoAmazon } from "@/lib/amazon/orders";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";

// Rate limit da Orders API da Amazon e bem mais apertado que o do ML (ver
// nota em lib/amazon/orders.ts), entao esta pagina pode demorar mais para
// carregar conforme o numero de contas/paginas de pedidos no periodo.
export const maxDuration = 60;

const PEDIDOS_POR_PAGINA = 15;

function formatarData(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
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

const formatarNumero = (n: number) => n.toLocaleString("pt-BR");

const formatarDataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

export default async function AmazonVendasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; conta?: string; pagina?: string }>;
}) {
  await exigirAcessoSecao("amazon", "amz_vendas");
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
  const filtroConta = params.conta ?? "todas";
  const paginaSolicitada = Math.max(1, Number(params.pagina) || 1);

  const periodo = periodoDeDatas(de, ate);

  const { data: contasBase } = await supabase
    .from("amazon_accounts")
    .select("id, seller_id, marketplace_id, nickname, apelido, cor")
    .order("nickname", { ascending: true });

  const contasParaBuscar = (contasBase ?? []).filter(
    (c) => filtroConta === "todas" || c.id === filtroConta
  );

  const resultados = await Promise.all(
    contasParaBuscar.map(async (conta) => {
      const nome = nomeConta(conta);
      const cor = (conta.cor as string | null) ?? COR_PADRAO;
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const vendas = await getVendas(
          accessToken,
          conta.marketplace_id as string,
          periodo,
          conta.id,
          nome
        );
        const cancelados = classificarCancelados(vendas.pedidos);
        return { conta, nome, cor, vendas, cancelados, erro: null as string | null };
      } catch (err) {
        console.error(`Erro ao buscar vendas Amazon de ${conta.nickname}:`, err);
        return {
          conta,
          nome,
          cor,
          vendas: null,
          cancelados: null,
          erro: "Falha ao buscar vendas desta conta.",
        };
      }
    })
  );

  const todosPedidos: PedidoAmazon[] = resultados
    .flatMap((r) => r.vendas?.pedidos ?? [])
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime());

  const totalPedidos = resultados.reduce((soma, r) => soma + (r.vendas?.totalPedidos ?? 0), 0);
  const totalValor = resultados.reduce((soma, r) => soma + (r.vendas?.valorSomado ?? 0), 0);
  const totalUnidades = resultados.reduce((soma, r) => soma + (r.vendas?.unidadesVendidas ?? 0), 0);
  const moeda = resultados.find((r) => r.vendas?.moeda)?.vendas?.moeda ?? "BRL";

  const totalCancelados = resultados.reduce((soma, r) => soma + (r.cancelados?.quantidade ?? 0), 0);
  const valorCancelado = resultados.reduce((soma, r) => soma + (r.cancelados?.valor ?? 0), 0);

  // --- Paginacao do extrato (15 em 15) ---
  const totalPaginasExtrato = Math.max(1, Math.ceil(todosPedidos.length / PEDIDOS_POR_PAGINA));
  const paginaAtual = Math.min(paginaSolicitada, totalPaginasExtrato);
  const pedidosPagina = todosPedidos.slice(
    (paginaAtual - 1) * PEDIDOS_POR_PAGINA,
    paginaAtual * PEDIDOS_POR_PAGINA
  );

  function hrefComPagina(p: number) {
    return `/dashboard/amazon/vendas?de=${de}&ate=${ate}&conta=${filtroConta}&pagina=${p}`;
  }

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
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Amazon · Vendas</h1>
        </div>
      </div>

      <p className="mb-4 rounded border border-dashed border-gray-300 p-3 text-xs text-gray-500 dark:border-gray-700">
        Extrato sem nome do comprador/produto por enquanto (a Orders API só libera esses dados via
        função restrita de PII, fora do escopo atual). Gestão detalhada de cada pedido continua sendo
        feita direto no Seller Central.
      </p>

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
        {presets.map((p) => (
          <Link
            key={p.label}
            href={`/dashboard/amazon/vendas?de=${p.de}&ate=${p.ate}&conta=${filtroConta}`}
            className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {p.label}
          </Link>
        ))}
      </div>

      <p className="mb-4 text-xs text-gray-400">
        Período: {new Date(de + "T00:00:00").toLocaleDateString("pt-BR")} até{" "}
        {new Date(ate + "T00:00:00").toLocaleDateString("pt-BR")} (horário de Brasília)
      </p>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase text-gray-400">Pedidos no período</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatarNumero(totalPedidos)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase text-gray-400">Vendas brutas no período</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatarMoeda(totalValor, moeda)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase text-gray-400">Unidades vendidas</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatarNumero(totalUnidades)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs uppercase text-gray-400">Cancelados no período</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatarNumero(totalCancelados)}</p>
          {valorCancelado > 0 && (
            <p className="text-xs text-gray-400">{formatarMoeda(valorCancelado, moeda)}</p>
          )}
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
                  <th className="p-3 text-right">Pedidos</th>
                  <th className="p-3 text-right">Vendas brutas</th>
                  <th className="p-3 text-right">Unidades</th>
                  <th className="p-3 text-right">Cancelados</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {resultados.map((r) => (
                  <tr key={r.conta.id}>
                    <td className="p-3">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: r.cor }} />
                      {r.nome}
                    </td>
                    {r.erro || !r.vendas ? (
                      <td colSpan={4} className="p-3 text-xs text-red-500">
                        {r.erro}
                      </td>
                    ) : (
                      <>
                        <td className="p-3 text-right">{formatarNumero(r.vendas.totalPedidos)}</td>
                        <td className="p-3 text-right">{formatarMoeda(r.vendas.valorSomado, r.vendas.moeda)}</td>
                        <td className="p-3 text-right">{formatarNumero(r.vendas.unidadesVendidas)}</td>
                        <td className="p-3 text-right">{formatarNumero(r.cancelados?.quantidade ?? 0)}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Extrato de pedidos</h2>
      {todosPedidos.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          Nenhum pedido encontrado neste período.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="p-3">Data</th>
                  <th className="p-3">Conta</th>
                  <th className="p-3">Pedido</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {pedidosPagina.map((pedido) => (
                  <tr key={pedido.id} className="dark:hover:bg-gray-800/60">
                    <td className="p-3 text-gray-600 dark:text-gray-300">{formatarDataHora(pedido.dataCriacao)}</td>
                    <td className="p-3 text-gray-600 dark:text-gray-300">{pedido.contaNickname}</td>
                    <td className="p-3 text-gray-600 dark:text-gray-300">{pedido.id}</td>
                    <td className="p-3 text-gray-600 dark:text-gray-300">{pedido.status}</td>
                    <td className="p-3 text-right font-medium text-gray-900 dark:text-gray-100">
                      {formatarMoeda(pedido.valor, pedido.moeda)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPaginasExtrato > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              {paginaAtual > 1 ? (
                <Link
                  href={hrefComPagina(paginaAtual - 1)}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  ← Anterior
                </Link>
              ) : (
                <span className="rounded border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-300 dark:border-gray-700 dark:text-gray-600">
                  ← Anterior
                </span>
              )}
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Página {paginaAtual} de {totalPaginasExtrato} ({formatarNumero(todosPedidos.length)} pedidos)
              </span>
              {paginaAtual < totalPaginasExtrato ? (
                <Link
                  href={hrefComPagina(paginaAtual + 1)}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Próxima →
                </Link>
              ) : (
                <span className="rounded border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-300 dark:border-gray-700 dark:text-gray-600">
                  Próxima →
                </span>
              )}
            </div>
          )}
        </>
      )}
    </main>
  );
}
