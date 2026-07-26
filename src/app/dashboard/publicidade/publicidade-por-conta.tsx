"use client";

import { useState } from "react";

// Numeros ja chegam formatados em texto pronto (calculados no servidor, em
// page.tsx) para manter o mesmo padrao de promocoes-por-conta.tsx / SLA de
// atendimento -- evita qualquer risco de mismatch de hidratacao e mantem a
// formatacao de moeda consistente em um unico lugar.
export type CampanhaFormatada = {
  id: number;
  nome: string;
  status: string;
  investimentoLabel: string;
  cliques: number;
  ctrLabel: string;
  acosLabel: string;
  roasLabel: string;
  vendasLabel: string;
};

export type ContaComCampanhas = {
  id: string;
  nome: string;
  cor: string;
  erro: string | null;
  semAnuncios: boolean;
  campanhas: CampanhaFormatada[];
};

const STATUS_LABELS: Record<string, { label: string; cor: string }> = {
  active: { label: "Ativa", cor: "bg-green-50 text-green-700" },
  paused: { label: "Pausada", cor: "bg-gray-100 text-gray-600" },
  deleted: { label: "Removida", cor: "bg-red-50 text-red-600" },
};

function CampanhaCard({ c }: { c: CampanhaFormatada }) {
  const status = STATUS_LABELS[c.status] ?? { label: c.status, cor: "bg-gray-100 text-gray-600" };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight text-gray-800 dark:text-gray-100">{c.nome}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${status.cor}`}>
          {status.label}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
        <span>Investimento: <span className="font-medium text-gray-700 dark:text-gray-200">{c.investimentoLabel}</span></span>
        <span>Cliques: <span className="font-medium text-gray-700 dark:text-gray-200">{c.cliques}</span></span>
        <span>CTR: <span className="font-medium text-gray-700 dark:text-gray-200">{c.ctrLabel}</span></span>
        <span>ACOS: <span className="font-medium text-gray-700 dark:text-gray-200">{c.acosLabel}</span></span>
        <span>ROAS: <span className="font-medium text-gray-700 dark:text-gray-200">{c.roasLabel}</span></span>
        <span>Vendas: <span className="font-medium text-gray-700 dark:text-gray-200">{c.vendasLabel}</span></span>
      </div>
    </div>
  );
}

function ContaAccordionItem({ conta, defaultOpen }: { conta: ContaComCampanhas; defaultOpen: boolean }) {
  const [aberto, setAberto] = useState(defaultOpen);
  const ativas = conta.campanhas.filter((c) => c.status === "active").length;

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
          <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">
            {conta.semAnuncios
              ? "sem Mercado Ads ativo"
              : `${conta.campanhas.length} campanha${conta.campanhas.length === 1 ? "" : "s"}${
                  ativas > 0 ? ` · ${ativas} ativa${ativas === 1 ? "" : "s"}` : ""
                }`}
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
          {conta.erro ? (
            <p className="text-xs text-red-500">{conta.erro}</p>
          ) : conta.semAnuncios ? (
            <p className="text-sm text-gray-400">Esta conta ainda não tem Mercado Ads ativo.</p>
          ) : conta.campanhas.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma campanha encontrada no período selecionado.</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {conta.campanhas.map((c) => (
                <CampanhaCard key={c.id} c={c} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PublicidadePorConta({ contas }: { contas: ContaComCampanhas[] }) {
  return (
    <div className="flex flex-col gap-3">
      {contas.map((conta, i) => (
        <ContaAccordionItem key={conta.id} conta={conta} defaultOpen={i === 0} />
      ))}
    </div>
  );
}
