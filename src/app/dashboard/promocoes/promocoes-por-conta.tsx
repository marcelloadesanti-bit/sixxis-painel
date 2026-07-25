"use client";

import { useState } from "react";
import { labelTipoPromocao } from "@/lib/mercadolivre/promotions";

// Datas ja chegam formatadas em texto pronto (calculadas no servidor, em
// page.tsx) para evitar mismatch de hidratacao entre o fuso do servidor e o
// do navegador -- ver comentario em page.tsx.
export type PromocaoFormatada = {
  id: string;
  tipo: string;
  status: string;
  nome: string | null;
  periodoLabel: string;
};

export type ContaComPromocoes = {
  id: string;
  nome: string;
  cor: string;
  erro: string | null;
  ativas: PromocaoFormatada[];
  pendentes: PromocaoFormatada[];
  outras: PromocaoFormatada[];
};

const STATUS_LABELS: Record<string, { label: string; cor: string }> = {
  started: { label: "Ativa", cor: "bg-green-50 text-green-700" },
  pending: { label: "Pendente / convite", cor: "bg-yellow-50 text-yellow-700" },
  candidate: { label: "Candidata", cor: "bg-blue-50 text-blue-700" },
  finished: { label: "Encerrada", cor: "bg-gray-100 text-gray-500" },
};

function TagPromocao({ p }: { p: PromocaoFormatada }) {
  const status = STATUS_LABELS[p.status] ?? { label: p.status, cor: "bg-gray-100 text-gray-600" };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold leading-tight text-gray-800 dark:text-gray-100">{p.nome ?? "—"}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${status.cor}`}>
          {status.label}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-400">{labelTipoPromocao(p.tipo)}</p>
      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{p.periodoLabel}</p>
    </div>
  );
}

function ContaAccordionItem({ conta, defaultOpen }: { conta: ContaComPromocoes; defaultOpen: boolean }) {
  const [aberto, setAberto] = useState(defaultOpen);
  const total = conta.ativas.length + conta.pendentes.length + conta.outras.length;

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
            {conta.ativas.length} ativa{conta.ativas.length === 1 ? "" : "s"}
            {conta.pendentes.length > 0 && ` · ${conta.pendentes.length} pendente${conta.pendentes.length === 1 ? "" : "s"}`}
            {conta.outras.length > 0 && ` · ${conta.outras.length} encerrada${conta.outras.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {conta.pendentes.length > 0 && (
            <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
              {conta.pendentes.length} convite{conta.pendentes.length === 1 ? "" : "s"}
            </span>
          )}
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${aberto ? "rotate-180" : ""}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.19l3.71-3.96a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </button>

      {aberto && (
        <div className="border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
          {conta.erro ? (
            <p className="text-xs text-red-500">{conta.erro}</p>
          ) : total === 0 ? (
            <p className="text-sm text-gray-400">
              Nenhuma promoção encontrada para esta conta. Convites do Mercado Livre aparecem aqui assim
              que forem disponibilizados.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              {conta.pendentes.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-yellow-700">
                    Convites pendentes
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {conta.pendentes.map((p) => (
                      <TagPromocao key={`${p.id}-${p.tipo}`} p={p} />
                    ))}
                  </div>
                </div>
              )}
              {conta.ativas.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Ativas
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {conta.ativas.map((p) => (
                      <TagPromocao key={`${p.id}-${p.tipo}`} p={p} />
                    ))}
                  </div>
                </div>
              )}
              {conta.outras.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                    Encerradas / outras
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {conta.outras.map((p) => (
                      <TagPromocao key={`${p.id}-${p.tipo}`} p={p} />
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 pt-3 dark:border-gray-700">
                <a
                  href={`/dashboard/anuncios/gestao?contas=${conta.id}`}
                  className="text-xs font-medium text-[var(--color-sixxis-blue)] hover:underline"
                >
                  Ver anúncios desta conta →
                </a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PromocoesPorConta({ contas }: { contas: ContaComPromocoes[] }) {
  return (
    <div className="flex flex-col gap-3">
      {contas.map((conta, i) => (
        <ContaAccordionItem key={conta.id} conta={conta} defaultOpen={i === 0} />
      ))}
    </div>
  );
}
