"use client";

import { useMemo, useState } from "react";
import type { ItemEstoque } from "@/lib/estoque/planilha";
import { GRUPOS, grupoDaCategoria, type GrupoId } from "@/lib/estoque/grupos";

type Consolidado = { totalSkus: number; saldoTotal: number };

export default function EstoqueResumoPainel({
  itens,
  consolidado,
}: {
  itens: ItemEstoque[];
  categorias: string[];
  consolidado: Consolidado;
}) {
  const [grupoSelecionado, setGrupoSelecionado] = useState<GrupoId | null>(null);

  const statsPorGrupo = useMemo(() => {
    const mapa = new Map<GrupoId, { totalSkus: number; saldoTotal: number }>();
    for (const g of GRUPOS) mapa.set(g.id, { totalSkus: 0, saldoTotal: 0 });
    for (const item of itens) {
      const grupo = grupoDaCategoria(item.categoria);
      const atual = mapa.get(grupo)!;
      atual.totalSkus += 1;
      atual.saldoTotal += item.saldoTotal;
    }
    return mapa;
  }, [itens]);

  const itensFiltrados = useMemo(() => {
    if (!grupoSelecionado) return itens;
    return itens.filter((i) => grupoDaCategoria(i.categoria) === grupoSelecionado);
  }, [itens, grupoSelecionado]);

  function alternarGrupo(id: GrupoId) {
    setGrupoSelecionado((atual) => (atual === id ? null : id));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-sixxis-navy)] dark:text-white">
          Consolidado geral
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <Stat label="SKUs" valor={consolidado.totalSkus} />
          <Stat label="Saldo total" valor={consolidado.saldoTotal.toLocaleString("pt-BR")} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {GRUPOS.map((g) => {
          const stats = statsPorGrupo.get(g.id) ?? { totalSkus: 0, saldoTotal: 0 };
          const ativo = grupoSelecionado === g.id;
          return (
            <button
              key={g.id}
              onClick={() => alternarGrupo(g.id)}
              className={`rounded-xl border p-4 text-left shadow-sm transition ${
                ativo
                  ? "border-[var(--color-sixxis-navy)] bg-[var(--color-sixxis-navy)] text-white"
                  : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
              }`}
            >
              <div className={`text-sm font-semibold ${ativo ? "text-white" : "text-[var(--color-sixxis-navy)] dark:text-white"}`}>
                {g.labelCurto}
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-xl font-bold ${ativo ? "text-white" : "text-gray-900 dark:text-gray-100"}`}>
                  {stats.saldoTotal.toLocaleString("pt-BR")}
                </span>
                <span className={`text-xs ${ativo ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>
                  unid. em {stats.totalSkus} SKUs
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setGrupoSelecionado(null)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            grupoSelecionado === null
              ? "bg-[var(--color-sixxis-navy)] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
        >
          Todos ({itens.length})
        </button>
        {GRUPOS.map((g) => {
          const stats = statsPorGrupo.get(g.id) ?? { totalSkus: 0, saldoTotal: 0 };
          return (
            <button
              key={g.id}
              onClick={() => alternarGrupo(g.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                grupoSelecionado === g.id
                  ? "bg-[var(--color-sixxis-navy)] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {g.labelCurto} ({stats.totalSkus})
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3 text-right">Saldo loja</th>
              <th className="px-4 py-3 text-right">Saldo full</th>
              <th className="px-4 py-3 text-right">Saldo total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {itensFiltrados.map((item) => (
              <tr key={item.sku} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900 dark:text-gray-100">
                  {item.sku}
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                  <div className="max-w-xs truncate" title={item.descricao}>
                    {item.descricao}
                  </div>
                  <div className="text-xs text-gray-400">{item.categoria}</div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                  {item.saldoLoja.toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                  {item.saldoFull.toLocaleString("pt-BR")}
                </td>
                <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                  {item.saldoTotal.toLocaleString("pt-BR")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {itensFiltrados.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum SKU encontrado.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, valor, destaque }: { label: string; valor: string | number; destaque?: string }) {
  return (
    <div>
      <div className={`text-2xl font-bold ${destaque ?? "text-[var(--color-sixxis-navy)] dark:text-white"}`}>
        {valor}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}
