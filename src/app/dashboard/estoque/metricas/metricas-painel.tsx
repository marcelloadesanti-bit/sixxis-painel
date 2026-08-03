"use client";

import { useMemo, useState } from "react";

export type LinhaMetrica = {
  sku: string;
  categoria: string;
  descricao: string;
  saldoTotal: number;
  saldoLoja: number;
  saldoFull: number;
  quantidade60d: number;
  velocidadeDiaria: number;
  diasAteRuptura: number | null;
  nivel: "critico" | "atencao" | "ok" | "sem_venda";
  proximaChegada: { data: string; quantidade: number } | null;
};

type Consolidado = { totalSkus: number; saldoTotal: number; criticos: number; atencao: number };

function corNivel(nivel: LinhaMetrica["nivel"]) {
  switch (nivel) {
    case "critico":
      return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", label: "Crítico" };
    case "atencao":
      return { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", label: "Atenção" };
    case "ok":
      return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", label: "OK" };
    default:
      return { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-500 dark:text-gray-400", label: "Sem venda" };
  }
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export default function MetricasEstoquePainel({
  linhas,
  categorias,
  consolidado,
}: {
  linhas: LinhaMetrica[];
  categorias: string[];
  consolidado: Consolidado;
}) {
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string | null>(null);

  const linhasFiltradas = useMemo(() => {
    if (!categoriaSelecionada) return linhas;
    return linhas.filter((l) => l.categoria === categoriaSelecionada);
  }, [linhas, categoriaSelecionada]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-sixxis-navy)] dark:text-white">
          Consolidado geral
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="SKUs" valor={consolidado.totalSkus} />
          <Stat label="Saldo total" valor={consolidado.saldoTotal.toLocaleString("pt-BR")} />
          <Stat label="Críticos" valor={consolidado.criticos} destaque="text-red-600 dark:text-red-400" />
          <Stat label="Atenção" valor={consolidado.atencao} destaque="text-amber-600 dark:text-amber-400" />
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
            Todas ({linhas.length})
          </button>
          {categorias.map((cat) => {
            const qtd = linhas.filter((l) => l.categoria === cat).length;
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
              <th className="px-4 py-3 text-right">Saldo (loja/full)</th>
              <th className="px-4 py-3 text-right">Vendas 60d</th>
              <th className="px-4 py-3 text-right">Vel. diária</th>
              <th className="px-4 py-3 text-right">Dias até ruptura</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Container que resolve</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {linhasFiltradas.map((linha) => {
              const cor = corNivel(linha.nivel);
              return (
                <tr key={linha.sku} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900 dark:text-gray-100">
                    {linha.sku}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    <div className="max-w-xs truncate" title={linha.descricao}>
                      {linha.descricao}
                    </div>
                    <div className="text-xs text-gray-400">{linha.categoria}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    <div className="font-medium">{linha.saldoTotal.toLocaleString("pt-BR")}</div>
                    <div className="text-xs text-gray-400">
                      {linha.saldoLoja.toLocaleString("pt-BR")} / {linha.saldoFull.toLocaleString("pt-BR")}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {linha.quantidade60d.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {linha.velocidadeDiaria.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                    {linha.diasAteRuptura === null ? "—" : `${linha.diasAteRuptura} dias`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cor.bg} ${cor.text}`}>
                      {cor.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {linha.proximaChegada ? (
                      <>
                        {formatarData(linha.proximaChegada.data)}{" "}
                        <span className="text-xs text-gray-400">
                          (+{linha.proximaChegada.quantidade.toLocaleString("pt-BR")})
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {linhasFiltradas.length === 0 && (
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
