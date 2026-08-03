"use client";

import { useState } from "react";

// Linha expansivel do extrato de Financeiro > Margem Bruta -- mesmo padrao
// visual/interacao da ExtratoLinha de Vendas (clique expande a quebra
// financeira), mas com a decomposicao de margem em vez da quebra generica
// de liquido.
export type LinhaMargemExtrato = {
  id: number;
  dataHoraLabel: string;
  contaNickname: string;
  comprador: string;
  produto: string;
  vendaBrutaLabel: string;
  taxaLabel: string;
  freteLabel: string | null; // null = ainda nao resolvido (cache em preenchimento)
  margemValorLabel: string | null;
  margemPctLabel: string | null;
  margemCor: "verde" | "amarelo" | "vermelho" | "neutro";
};

const CORES_MARGEM: Record<LinhaMargemExtrato["margemCor"], string> = {
  verde: "text-green-600 dark:text-green-400",
  amarelo: "text-amber-600 dark:text-amber-400",
  vermelho: "text-red-600 dark:text-red-400",
  neutro: "text-gray-500 dark:text-gray-400",
};

export default function MargemExtratoLinha({ linha }: { linha: LinhaMargemExtrato }) {
  const [aberto, setAberto] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-0 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60"
      >
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {linha.dataHoraLabel} · {linha.contaNickname}
          </p>
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{linha.comprador}</p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{linha.produto}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`whitespace-nowrap text-sm font-semibold ${CORES_MARGEM[linha.margemCor]}`}>
            {linha.margemPctLabel ?? "Calculando…"}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">{linha.vendaBrutaLabel}</span>
        </div>
      </button>

      {aberto && (
        <div className="bg-gray-50 p-4 text-sm dark:bg-gray-900/30">
          <table className="w-full max-w-xs">
            <tbody>
              <tr>
                <td className="py-0.5 text-gray-500 dark:text-gray-400">Venda bruta</td>
                <td className="py-0.5 text-right">{linha.vendaBrutaLabel}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-gray-500 dark:text-gray-400">Comissão da plataforma</td>
                <td className="py-0.5 text-right">−{linha.taxaLabel}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-gray-500 dark:text-gray-400">Frete</td>
                <td className="py-0.5 text-right">{linha.freteLabel ? `−${linha.freteLabel}` : "calculando…"}</td>
              </tr>
              <tr className={`font-medium ${CORES_MARGEM[linha.margemCor]}`}>
                <td className="py-0.5">Margem bruta</td>
                <td className="py-0.5 text-right">
                  {linha.margemValorLabel ?? "—"} {linha.margemPctLabel ? `(${linha.margemPctLabel})` : ""}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
