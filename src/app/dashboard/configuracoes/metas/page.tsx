import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { definirMetaMesAction } from "./actions";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { salvo } = await searchParams;
  const { podeEditar } = await exigirAcessoSecao("metas");

  const supabase = await createClient();
  const { data: metasRaw } = await supabase
    .from("metas_mensais")
    .select("ano, mes, valor")
    .order("ano", { ascending: false })
    .order("mes", { ascending: false });

  const metas = (metasRaw ?? []).map((m) => ({
    ano: m.ano as number,
    mes: m.mes as number,
    valor: Number(m.valor),
  }));

  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  const metaAtual = metas.find((m) => m.ano === anoAtual && m.mes === mesAtual);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/dashboard" className="text-sm text-[var(--color-sixxis-blue)] underline">
        ← Voltar ao painel
      </Link>
      <h1 className="mt-4 mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">
        Metas mensais
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Defina o valor da meta de faturamento de cada mês. Apenas administradores veem esta página; o
        progresso aparece de forma resumida para todos no Resumo.
      </p>

      {salvo === "1" && (
        <p className="mb-4 rounded bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          Meta salva com sucesso.
        </p>
      )}

      {podeEditar && (
        <form
          action={definirMetaMesAction}
          className="mb-8 flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-4"
        >
          <div>
            <label className="mb-1 block text-xs text-gray-500">Mês</label>
            <select
              name="mes"
              defaultValue={metaAtual?.mes ?? mesAtual}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              {MESES.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Ano</label>
            <input
              type="number"
              name="ano"
              defaultValue={metaAtual?.ano ?? anoAtual}
              className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Valor da meta (R$)</label>
            <input
              type="number"
              name="valor"
              step="0.01"
              min="0.01"
              defaultValue={metaAtual?.valor ?? ""}
              placeholder="Ex: 1000000"
              className="w-44 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-[var(--color-sixxis-navy)] px-4 py-2 text-sm font-medium text-white"
          >
            Salvar meta
          </button>
        </form>
      )}

      <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Metas cadastradas</h2>
      {metas.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhuma meta definida ainda.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
          {metas.map((m) => (
            <li key={`${m.ano}-${m.mes}`} className="flex items-center justify-between p-3 text-sm">
              <span className="text-gray-700">
                {MESES[m.mes - 1]} de {m.ano}
                {m.ano === anoAtual && m.mes === mesAtual && (
                  <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                    mês atual
                  </span>
                )}
              </span>
              <span className="font-medium text-gray-900">{formatarMoeda(m.valor)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
