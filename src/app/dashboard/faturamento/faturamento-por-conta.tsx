"use client";

import { useState } from "react";

// Fase 2 (verificação): agora com dados reais da API de Faturamento
// (Billing) do Mercado Livre. Layout ainda simples/cru de propósito -- o
// objetivo desta etapa é confirmar que os números batem com o Mercado Livre
// antes de desenhar a versão final (ver conversa de 27/07/2026).

export type ItemFaturamentoFormatado = { label: string; valorLabel: string };

export type ContaFaturamento = {
  id: string;
  nome: string;
  cor: string;
  erro: string | null;
  semPeriodo: boolean;
  desatualizado: boolean;
  atualizadoEmLabel: string | null;
  periodoLabel: string | null;
  totalCobradoLabel: string | null;
  totalPercepcoesLabel: string | null;
  totalPagoLabel: string | null;
  totalNotaCreditoLabel: string | null;
  totalRecebidoLabel: string | null;
  totalDividaLabel: string | null;
  encargos: ItemFaturamentoFormatado[];
  bonificacoes: ItemFaturamentoFormatado[];
};

function Campo({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-100">{valor ?? "—"}</p>
    </div>
  );
}

function ListaItens({ titulo, itens }: { titulo: string; itens: ItemFaturamentoFormatado[] }) {
  if (itens.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white text-sm dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
        {itens.map((item, i) => (
          <li key={i} className="flex items-center justify-between px-3 py-2">
            <span className="text-gray-600 dark:text-gray-300">{item.label}</span>
            <span className="font-medium text-gray-800 dark:text-gray-100">{item.valorLabel}</span>
          </li>
        ))}
      </ul>
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
          {conta.periodoLabel && (
            <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">{conta.periodoLabel}</span>
          )}
          {conta.desatualizado && (
            <span className="shrink-0 rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-medium text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-500">
              desatualizado
            </span>
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
          {conta.atualizadoEmLabel && (
            <p className="mb-2 text-[11px] text-gray-400">
              Atualizado em {conta.atualizadoEmLabel}
              {conta.desatualizado && " (cache antigo -- clique em Atualizar para tentar de novo)"}
            </p>
          )}
          {conta.erro ? (
            <p className="text-xs text-red-500">{conta.erro}</p>
          ) : conta.semPeriodo ? (
            <p className="text-sm text-gray-400">
              Nenhum período de faturamento disponível ainda para esta conta.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <Campo label="Total cobrado no período" valor={conta.totalCobradoLabel} />
                <Campo label="Total pago" valor={conta.totalPagoLabel} />
                <Campo label="Dívida em aberto" valor={conta.totalDividaLabel} />
                <Campo label="Percepções tributárias" valor={conta.totalPercepcoesLabel} />
                <Campo label="Nota de crédito" valor={conta.totalNotaCreditoLabel} />
                <Campo label="Total recebido (consolidado)" valor={conta.totalRecebidoLabel} />
              </div>
              <ListaItens titulo="Encargos" itens={conta.encargos} />
              <ListaItens titulo="Bonificações" itens={conta.bonificacoes} />
            </>
          )}
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
