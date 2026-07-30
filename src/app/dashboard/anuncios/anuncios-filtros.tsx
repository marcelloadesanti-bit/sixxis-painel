"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { OrdenacaoAnuncios } from "@/lib/mercadolivre/items";
import type { PresetKey } from "@/lib/date-utils";

type ContaOpcao = { id: string; nickname: string; cor: string };

export default function AnunciosFiltros({
  opcoesOrdenacao,
  ordenacaoAtual,
  todasContas,
  contasSelecionadas,
  presets,
  presetAtual,
  baseHref = "/dashboard/anuncios",
}: {
  opcoesOrdenacao: { key: OrdenacaoAnuncios; label: string }[];
  ordenacaoAtual: OrdenacaoAnuncios;
  todasContas: ContaOpcao[];
  contasSelecionadas: string[];
  presets: { key: PresetKey; label: string }[];
  presetAtual: PresetKey;
  baseHref?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function atualizar(mudancas: Record<string, string>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [chave, valor] of Object.entries(mudancas)) {
      params.set(chave, valor);
    }
    params.set("pagina", "1");
    router.push(`${baseHref}?${params.toString()}`);
  }

  function alternarConta(contaId: string) {
    const atual = new Set(contasSelecionadas);
    if (atual.has(contaId)) {
      atual.delete(contaId);
    } else {
      atual.add(contaId);
    }
    const novas = atual.size > 0 ? Array.from(atual) : todasContas.map((c) => c.id);
    atualizar({ contas: novas.join(",") });
  }

  const todasMarcadas = contasSelecionadas.length === todasContas.length;

  return (
    <div className="flex flex-col gap-3 rounded border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase text-gray-400">Ordenar por</span>
        {opcoesOrdenacao.map((op) => (
          <button
            key={op.key}
            onClick={() => atualizar({ ordenar: op.key })}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              ordenacaoAtual === op.key
                ? "bg-[var(--color-sixxis-navy)] text-white"
                : "border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {op.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase text-gray-400">Período do gráfico</span>
        {presets
          .filter((p) => p.key !== "personalizado")
          .map((p) => (
            <button
              key={p.key}
              onClick={() => atualizar({ periodo: p.key })}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                presetAtual === p.key
                  ? "bg-[var(--color-sixxis-navy)] text-white"
                  : "border border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}
      </div>

      {todasContas.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase text-gray-400">Contas</span>
          <button
            onClick={() => atualizar({ contas: todasContas.map((c) => c.id).join(",") })}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              todasMarcadas
                ? "bg-[var(--color-sixxis-navy)] text-white"
                : "border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Consolidado (todas)
          </button>
          {todasContas.map((c) => {
            const marcado = contasSelecionadas.includes(c.id);
            return (
              <label
                key={c.id}
                className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700"
              >
                <input type="checkbox" checked={marcado} onChange={() => alternarConta(c.id)} />
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.cor }} />
                {c.nickname}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
