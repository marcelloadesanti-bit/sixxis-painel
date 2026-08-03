"use client";

import { useMemo, useState } from "react";
import type { ItemEstoque } from "@/lib/estoque/planilha";

type Consolidado = { totalSkus: number; saldoTotal: number };

export default function EstoqueResumoPainel({
  itens,
  categorias,
  consolidado,
}: {
  itens: ItemEstoque[];
  categorias: string[];
  consolidado: Consolidado;
}) {
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string | null>(null);

  const itensFiltrados = useMemo(() => {
    if (!categoriaSelecionada) return itens;
    return itens.filter((i) => i.categoria === categoriaSelecionada);
  }, [itens, categoriaSelecionada]);

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

      {categorias.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategoriaSelecionada(null)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
              categoriaSelecionada === null
                ? "bg-[var(--color-sixxis-navy)] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
          >
            Todas ({itens.length})
          </button>
          {categorias.map((cat) => {
            const qtd = itens.filter((i) => i.categoria === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setCategoriaSelecionada(cat)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  categoriaSelecionada === cat
                    ? "bg-[var(--color-sixxis-navy)] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                }`}
              >
                {cat} ({qtd})
              </button>
            );
          })}
        </div>
      )}

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
