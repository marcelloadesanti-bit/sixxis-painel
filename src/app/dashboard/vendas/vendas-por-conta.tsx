"use client";

import { useState } from "react";

// 27/07/2026: accordion "Por conta" da aba Vendas, no mesmo padrão visual já
// usado em Promoções/Pós-venda/Faturamento -- fechado mostra só o nome da
// conta + um resumo compacto, aberto mostra a grade completa de métricas.
// Valores já chegam formatados em texto pronto (calculados no servidor em
// page.tsx) para evitar mismatch de hidratação entre o fuso do servidor e o
// do navegador.
export type ContaVendas = {
  id: string;
  nome: string;
  cor: string;
  erro: string | null;
  resumoFechado: string;
  vendasBrutasLabel: string;
  unidadesVendidasLabel: string;
  ticketMedioLabel: string;
  visitasLabel: string;
  quantidadeVendasLabel: string;
  conversaoLabel: string;
  canceladasLabel: string;
  canceladasValorLabel: string;
  devolvidasLabel: string;
  devolvidasValorLabel: string;
};

function Campo({
  label,
  valor,
  valorSecundario,
}: {
  label: string;
  valor: string;
  valorSecundario?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-100">{valor}</p>
      {valorSecundario && <p className="text-xs text-gray-400">{valorSecundario}</p>}
    </div>
  );
}

function ContaAccordionItem({ conta, defaultOpen }: { conta: ContaVendas; defaultOpen: boolean }) {
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
          {!conta.erro && (
            <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">{conta.resumoFechado}</span>
          )}
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
          {conta.erro ? (
            <p className="text-xs text-red-500">{conta.erro}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Campo label="Vendas brutas" valor={conta.vendasBrutasLabel} />
              <Campo label="Unidades vendidas" valor={conta.unidadesVendidasLabel} />
              <Campo label="Ticket médio" valor={conta.ticketMedioLabel} />
              <Campo label="Visitas" valor={conta.visitasLabel} />
              <Campo label="Quantidade de vendas" valor={conta.quantidadeVendasLabel} />
              <Campo label="Conversão" valor={conta.conversaoLabel} />
              <Campo
                label="Vendas canceladas"
                valor={conta.canceladasLabel}
                valorSecundario={conta.canceladasValorLabel}
              />
              <Campo
                label="Vendas devolvidas"
                valor={conta.devolvidasLabel}
                valorSecundario={conta.devolvidasValorLabel}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VendasPorConta({ contas }: { contas: ContaVendas[] }) {
  return (
    <div className="flex flex-col gap-3">
      {contas.map((conta, i) => (
        <ContaAccordionItem key={conta.id} conta={conta} defaultOpen={i === 0} />
      ))}
    </div>
  );
}
