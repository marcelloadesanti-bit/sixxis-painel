"use client";

import { useState } from "react";

// Layout final (27/07/2026): dados reais da API de Faturamento (Billing) do
// Mercado Livre, com os campos renomeados para termos de negócio. Nota
// importante -- a API de Billing traz as COBRANÇAS que o ML faz da conta
// (tarifas, frete, ads), não o saldo de vendas do vendedor. Por isso os
// termos "Disponível" / "A receber" (que existem no saldo do Mercado Pago)
// não aparecem aqui -- os mais próximos e corretos são "Despesas do
// período", "Já pago" e "Saldo em aberto" (o que ainda falta pagar ao ML).

// 27/07/2026: os encargos agora vem agrupados por categoria (a mesma
// classificação que o painel oficial do Mercado Livre usa -- "Tarifas de
// venda", "Tarifas de envios", etc.), em vez de uma lista solta de códigos
// internos (CVVML, CFONPN...) que ninguém consegue interpretar.
export type ItemFaturamentoFormatado = { label: string; valorLabel: string; temDescricao: boolean; codigo: string };
export type GrupoFaturamentoFormatado = { nome: string; totalLabel: string; itens: ItemFaturamentoFormatado[] };

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
  encargos: GrupoFaturamentoFormatado[];
  bonificacoes: GrupoFaturamentoFormatado[];
};

function Campo({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-100">{valor ?? "—"}</p>
    </div>
  );
}

function CampoSecundario({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span>{label}</span>
      <span className="font-medium text-gray-600 dark:text-gray-300">{valor ?? "—"}</span>
    </div>
  );
}

// Mostra os encargos/bonificações agrupados por categoria, igual ao painel
// oficial do Mercado Livre (ex: "Tarifas de venda: R$ X", com os itens que
// compõem esse total logo abaixo). Itens sem descrição amigável da API
// mostram o código interno de forma explícita, em vez de esconder que não
// sabemos do que se trata.
function ListaGrupos({ titulo, grupos }: { titulo: string; grupos: GrupoFaturamentoFormatado[] }) {
  if (grupos.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      <div className="divide-y divide-gray-200 rounded border border-gray-200 bg-white text-sm dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
        {grupos.map((grupo) => (
          <div key={grupo.nome} className="px-3 py-2">
            <div className="flex items-center justify-between font-medium text-gray-800 dark:text-gray-100">
              <span>{grupo.nome}</span>
              <span>{grupo.totalLabel}</span>
            </div>
            {grupo.itens.length > 1 && (
              <ul className="mt-1 space-y-0.5 pl-3">
                {grupo.itens.map((item, i) => (
                  <li key={i} className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      {item.temDescricao ? item.label : `Código ${item.codigo} (Mercado Livre não informa descrição para este item)`}
                    </span>
                    <span>{item.valorLabel}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
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
            <p className={`text-xs ${conta.erro.includes("limite de contas por carregamento") ? "text-gray-500" : "text-red-500"}`}>
              {conta.erro}
            </p>
          ) : conta.semPeriodo ? (
            <p className="text-sm text-gray-400">
              Nenhum período de faturamento disponível ainda para esta conta.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Campo label="Despesas do período" valor={conta.totalCobradoLabel} />
                <Campo label="Já pago" valor={conta.totalPagoLabel} />
                <Campo label="Saldo em aberto" valor={conta.totalDividaLabel} />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-3 dark:border-gray-700 dark:bg-gray-800">
                <CampoSecundario label="Percepções tributárias" valor={conta.totalPercepcoesLabel} />
                <CampoSecundario label="Nota de crédito" valor={conta.totalNotaCreditoLabel} />
                <CampoSecundario label="Recebido (consolidado)" valor={conta.totalRecebidoLabel} />
              </div>

              <ListaGrupos titulo="Encargos por categoria" grupos={conta.encargos} />
              <ListaGrupos titulo="Bonificações por categoria" grupos={conta.bonificacoes} />
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
