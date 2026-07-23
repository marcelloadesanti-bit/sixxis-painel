import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getVendas, periodoDeDatas, type Pedido } from "@/lib/mercadolivre/orders";

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

const formatarDataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; conta?: string }>;
}) {
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

  const periodo = periodoDeDatas(de, ate);

  const { data: contasBase } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname")
    .order("nickname", { ascending: true });

  const contasParaBuscar = (contasBase ?? []).filter(
    (c) => filtroConta === "todas" || c.id === filtroConta
  );

  const resultados = await Promise.all(
    contasParaBuscar.map(async (conta) => {
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const vendas = await getVendas(accessToken, conta.ml_user_id, periodo, conta.id, conta.nickname);
        return { conta, vendas, erro: null as string | null };
      } catch (err) {
        console.error(`Erro ao buscar vendas de ${conta.nickname}:`, err);
        return { conta, vendas: null, erro: "Falha ao buscar vendas desta conta." };
      }
    })
  );

  const todosPedidos: Pedido[] = resultados
    .flatMap((r) => r.vendas?.pedidos ?? [])
    .sort((a, b) => new Date(b.dataCriacao).getTime() - new Date(a.dataCriacao).getTime());

  const totalPedidos = resultados.reduce((soma, r) => soma + (r.vendas?.totalPedidos ?? 0), 0);
  const totalValor = resultados.reduce((soma, r) => soma + (r.vendas?.valorSomado ?? 0), 0);
  const algumCortado = resultados.some((r) => r.vendas?.cortado);
  const moeda = resultados.find((r) => r.vendas?.moeda)?.vendas?.moeda ?? "BRL";

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
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">
            Vendas e faturamento
          </h1>
        </div>
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-3 rounded border border-gray-200 p-4">
        <div>
          <label className="mb-1 block text-xs text-gray-500">De</label>
          <input
            type="date"
            name="de"
            defaultValue={de}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Até</label>
          <input
            type="date"
            name="ate"
            defaultValue={ate}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Conta</label>
          <select
            name="conta"
            defaultValue={filtroConta}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="todas">Todas as contas</option>
            {(contasBase ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nickname}
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
            href={`/dashboard/vendas?de=${p.de}&ate=${p.ate}&conta=${filtroConta}`}
            className="rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            {p.label}
          </Link>
        ))}
      </div>

      <p className="mb-4 text-xs text-gray-400">
        Período: {new Date(de + "T00:00:00").toLocaleDateString("pt-BR")} até{" "}
        {new Date(ate + "T00:00:00").toLocaleDateString("pt-BR")} (horário de Brasília)
      </p>

      <div className="mb-8 grid grid-cols-2 gap-4">
        <div className="rounded border border-gray-200 p-4">
          <p className="text-xs uppercase text-gray-400">Pedidos pagos no período</p>
          <p className="text-2xl font-bold text-gray-900">{totalPedidos}</p>
        </div>
        <div className="rounded border border-gray-200 p-4">
          <p className="text-xs uppercase text-gray-400">Faturamento no período</p>
          <p className="text-2xl font-bold text-gray-900">{formatarMoeda(totalValor, moeda)}</p>
        </div>
      </div>

      {resultados.length > 1 && (
        <div className="mb-8">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Por conta</h2>
          <ul className="divide-y divide-gray-200 rounded border border-gray-200">
            {resultados.map(({ conta, vendas, erro }) => (
              <li key={conta.id} className="flex items-center justify-between p-3 text-sm">
                <span className="font-medium text-gray-800">{conta.nickname}</span>
                {vendas ? (
                  <span className="text-gray-600">
                    {vendas.totalPedidos} pedidos · {formatarMoeda(vendas.valorSomado, vendas.moeda)}
                  </span>
                ) : (
                  <span className="text-red-500">{erro}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {algumCortado && (
        <p className="mb-4 text-xs text-amber-600">
          Período com muitos pedidos: o total de pedidos e o faturamento estão corretos, mas o
          extrato abaixo pode não listar 100% dos pedidos individuais.
        </p>
      )}

      <h2 className="mb-2 text-sm font-semibold text-gray-700">Extrato de pedidos</h2>
      {todosPedidos.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Nenhum pedido pago encontrado neste período.
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Conta</th>
                <th className="p-3">Comprador</th>
                <th className="p-3">Produto</th>
                <th className="p-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {todosPedidos.slice(0, 300).map((pedido) => (
                <tr key={pedido.id}>
                  <td className="p-3 text-gray-600">{formatarDataHora(pedido.dataCriacao)}</td>
                  <td className="p-3 text-gray-600">{pedido.contaNickname}</td>
                  <td className="p-3 text-gray-600">{pedido.comprador}</td>
                  <td className="p-3 text-gray-600">{pedido.produto}</td>
                  <td className="p-3 text-right font-medium text-gray-900">
                    {formatarMoeda(pedido.valor, pedido.moeda)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
