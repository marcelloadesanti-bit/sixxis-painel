"use client";

import { useState } from "react";

// Fase 1 (estrutura): ainda sem dados reais -- a API de Faturamento do
// Mercado Livre (Billing) retorna 404 para o app Sixxis (validado em
// 26/07/2026 com 2 contas diferentes). O layout ja fica pronto para receber
// os valores reais assim que a liberacao sair no Developer Center.
export type ContaFaturamento = {
  id: string;
  nome: string;
  cor: string;
};

function PlaceholderCard({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-300 dark:text-gray-600">—</p>
    </div>
  );
}

function ContaAccordionItem({ conta, defaultOpen }: { conta: ContaFaturamento; defaultOpen: boolean }) {
  const [aberto, setAberto] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-3 w-3 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: conta.cor }}
          />
          <span className="truncate font-semibold text-gray-800 dark:text-gray-100">{conta.nome}</span>
          <span className="hidden shrink-0 rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-medium text-yellow-700 sm:inline dark:bg-yellow-900/20 dark:text-yellow-500">
            Aguardando liberação da API
          </span>
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${aberto ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.19l3.71-3.96a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {aberto && (
        <div className="border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <PlaceholderCard label="Disponível" />
            <PlaceholderCard label="A receber" />
            <PlaceholderCard label="Retido (reclamações)" />
            <PlaceholderCard label="Despesas do período" />
          </div>
          <p className="mt-3 text-xs text-gray-400">
            Despesas, faturas e relatórios de gastos desta conta aparecerão aqui assim que a API de
            Faturamento do Mercado Livre estiver liberada para o app Sixxis.
          </p>
        </div>
      )}
    </div>
  );
}

export default function FaturamentoPorConta({ contas }: { contas: ContaFaturamento[] }) {
  return (
    <div className="flex flex-col gap-3">
      {contas.map((conta, i) => (
        <ContaAccordionItem key={conta.id} conta={conta} defaultOpen={i === 0} />
      ))}
    </div>
  );
}
