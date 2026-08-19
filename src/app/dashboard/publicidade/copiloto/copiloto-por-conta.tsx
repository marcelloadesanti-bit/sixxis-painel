"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { Sugestao } from "@/lib/mercadolivre/copiloto";
import { ignorarSugestaoAction } from "./actions";

export type ContaComSugestoes = {
  id: string;
  nome: string;
  cor: string;
  sugestoes: Sugestao[];
  erro: string | null;
};

const URGENCIA_LABEL: Record<Sugestao["urgencia"], string> = {
  alta: "Alta urgencia",
  media: "Media urgencia",
};

const URGENCIA_CLASSE: Record<Sugestao["urgencia"], string> = {
  alta: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900",
  media:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900",
};

function SugestaoCard({ sugestao, onIgnorar }: { sugestao: Sugestao; onIgnorar: (s: Sugestao) => void }) {
  const [pending, startTransition] = useTransition();
  const externo = sugestao.linkAcao.startsWith("http");

  function handleIgnorar() {
    startTransition(async () => {
      const res = await ignorarSugestaoAction(sugestao.contaId, sugestao.tipo, sugestao.referenciaId);
      if (res.ok) onIgnorar(sugestao);
    });
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <span
        className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${URGENCIA_CLASSE[sugestao.urgencia]}`}
      >
        {URGENCIA_LABEL[sugestao.urgencia]}
      </span>
      <p className="mt-2 text-sm font-medium text-gray-900 dark:text-gray-50">{sugestao.titulo}</p>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{sugestao.detalhe}</p>
      <div className="mt-3 flex items-center gap-3">
        {externo ? (
          <a
            href={sugestao.linkAcao}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
          >
            {sugestao.linkLabel}
          </a>
        ) : (
          <Link
            href={sugestao.linkAcao}
            className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
          >
            {sugestao.linkLabel}
          </Link>
        )}
        <button
          type="button"
          onClick={handleIgnorar}
          disabled={pending}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {pending ? "Ignorando..." : "Ignorar"}
        </button>
      </div>
    </div>
  );
}

function ContaAccordion({
  conta,
  aberta,
  onToggle,
  onIgnorar,
}: {
  conta: ContaComSugestoes;
  aberta: boolean;
  onToggle: () => void;
  onIgnorar: (s: Sugestao) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 bg-gray-50 px-4 py-3 text-left dark:bg-gray-900"
      >
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: conta.cor }} />
          <span className="text-sm font-medium text-gray-900 dark:text-gray-50">{conta.nome}</span>
        </div>
        <div className="flex items-center gap-3">
          {conta.erro ? (
            <span className="text-xs text-red-500">{conta.erro}</span>
          ) : (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {conta.sugestoes.length === 0 ? "Nenhuma sugestao" : `${conta.sugestoes.length} sugestao(oes)`}
            </span>
          )}
          <span className="text-gray-400">{aberta ? "▲" : "▾"}</span>
        </div>
      </button>
      {aberta && (
        <div className="space-y-3 p-4">
          {conta.sugestoes.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Nenhuma sugestao no momento. Tudo dentro do esperado.
            </p>
          ) : (
            conta.sugestoes.map((s) => (
              <SugestaoCard key={`${s.tipo}:${s.referenciaId}`} sugestao={s} onIgnorar={onIgnorar} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function CopilotoPorConta({ contas }: { contas: ContaComSugestoes[] }) {
  const [dados, setDados] = useState(contas);
  const [abertaId, setAbertaId] = useState<string | null>(contas.find((c) => c.sugestoes.length > 0)?.id ?? null);

  function handleIgnorar(contaId: string, sugestao: Sugestao) {
    setDados((prev) =>
      prev.map((c) =>
        c.id === contaId
          ? {
              ...c,
              sugestoes: c.sugestoes.filter(
                (s) => !(s.tipo === sugestao.tipo && s.referenciaId === sugestao.referenciaId)
              ),
            }
          : c
      )
    );
  }

  const totalAtual = dados.reduce((acc, c) => acc + c.sugestoes.length, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">Total de sugestoes ativas</p>
        <p className="mt-1 text-2xl font-semibold text-gray-900 dark:text-gray-50">{totalAtual}</p>
      </div>

      <div className="space-y-3">
        {dados.map((conta) => (
          <ContaAccordion
            key={conta.id}
            conta={conta}
            aberta={abertaId === conta.id}
            onToggle={() => setAbertaId((prev) => (prev === conta.id ? null : conta.id))}
            onIgnorar={(s) => handleIgnorar(conta.id, s)}
          />
        ))}
      </div>
    </div>
  );
}
