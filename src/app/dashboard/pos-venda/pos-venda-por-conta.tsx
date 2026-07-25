"use client";

import { useState } from "react";
import Link from "next/link";

// Datas ja chegam formatadas em texto pronto (calculadas no servidor, em
// page.tsx) para evitar mismatch de hidratacao entre o fuso do servidor e o
// do navegador -- mesmo padrao usado em promocoes-por-conta.tsx.
export type PerguntaFormatada = {
  id: number;
  texto: string;
  compradorLabel: string;
  itemId: string;
  dataLabel: string;
  contaId: string;
};

export type MensagemFormatada = {
  packId: string | null;
  resource: string;
  quantidade: number;
  contaId: string;
};

export type ContaPosVenda = {
  id: string;
  nome: string;
  cor: string;
  erro: string | null;
  perguntas: PerguntaFormatada[];
  mensagens: MensagemFormatada[];
};

function ContaAccordionItem({
  conta,
  defaultOpen,
  podeEditar,
  responderPerguntaAction,
  mostrarPerguntas,
  mostrarMensagens,
}: {
  conta: ContaPosVenda;
  defaultOpen: boolean;
  podeEditar: boolean;
  responderPerguntaAction: (formData: FormData) => void | Promise<void>;
  mostrarPerguntas: boolean;
  mostrarMensagens: boolean;
}) {
  const [aberto, setAberto] = useState(defaultOpen);
  const totalMensagens = conta.mensagens.reduce((s, m) => s + m.quantidade, 0);
  const total = conta.perguntas.length + conta.mensagens.length;

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
            {mostrarPerguntas && `${conta.perguntas.length} pergunta${conta.perguntas.length === 1 ? "" : "s"}`}
            {mostrarPerguntas && mostrarMensagens && " · "}
            {mostrarMensagens && `${conta.mensagens.length} conversa${conta.mensagens.length === 1 ? "" : "s"}`}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {total > 0 && (
            <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
              {total} pendência{total === 1 ? "" : "s"}
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
            <p className="text-sm text-gray-400">Nenhuma pendência para esta conta. 🎉</p>
          ) : (
            <div className="flex flex-col gap-5">
              {mostrarPerguntas && conta.perguntas.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Perguntas não respondidas
                  </p>
                  <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
                    {conta.perguntas.map((p) => (
                      <li key={p.id} className="p-3">
                        <p className="mb-1 text-xs text-gray-400">
                          {p.compradorLabel} · anúncio {p.itemId} · {p.dataLabel}
                        </p>
                        <p className="mb-2 text-sm text-gray-800 dark:text-gray-100">{p.texto}</p>
                        {podeEditar ? (
                          <form action={responderPerguntaAction} className="flex items-start gap-2">
                            <input type="hidden" name="contaId" value={p.contaId} />
                            <input type="hidden" name="questionId" value={p.id} />
                            <textarea
                              name="texto"
                              required
                              rows={2}
                              placeholder="Escreva a resposta..."
                              className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                            <button
                              type="submit"
                              className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
                            >
                              Responder
                            </button>
                          </form>
                        ) : (
                          <p className="text-xs italic text-gray-400">Acesso somente leitura.</p>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {mostrarMensagens && conta.mensagens.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Mensagens com pendência ({totalMensagens} não lida{totalMensagens === 1 ? "" : "s"})
                  </p>
                  <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
                    {conta.mensagens.map((m) => (
                      <li key={m.resource}>
                        <Link
                          href={m.packId ? `/dashboard/pos-venda/mensagens/${m.packId}?conta=${m.contaId}` : "#"}
                          className="flex items-center justify-between p-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/40"
                        >
                          <span className="text-xs text-gray-400">
                            {m.resource} · clique para ver{podeEditar ? " e responder" : ""}
                          </span>
                          <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
                            {m.quantidade} não lida{m.quantidade > 1 ? "s" : ""}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function PosVendaPorConta({
  contas,
  podeEditar,
  responderPerguntaAction,
  mostrarPerguntas,
  mostrarMensagens,
}: {
  contas: ContaPosVenda[];
  podeEditar: boolean;
  responderPerguntaAction: (formData: FormData) => void | Promise<void>;
  mostrarPerguntas: boolean;
  mostrarMensagens: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      {contas.map((conta, i) => (
        <ContaAccordionItem
          key={conta.id}
          conta={conta}
          defaultOpen={i === 0}
          podeEditar={podeEditar}
          responderPerguntaAction={responderPerguntaAction}
          mostrarPerguntas={mostrarPerguntas}
          mostrarMensagens={mostrarMensagens}
        />
      ))}
    </div>
  );
}
