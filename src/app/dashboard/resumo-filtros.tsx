"use client";

import { useRouter, useSearchParams } from "next/navigation";

type ContaOpcao = { id: string; nickname: string; cor: string };

export default function ResumoFiltros({
  todasContas,
  contasSelecionadas,
}: {
  todasContas: ContaOpcao[];
  contasSelecionadas: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function alternarConta(contaId: string) {
    const atual = new Set(contasSelecionadas);
    if (atual.has(contaId)) {
      atual.delete(contaId);
    } else {
      atual.add(contaId);
    }
    const novas = atual.size > 0 ? Array.from(atual) : todasContas.map((c) => c.id);
    const params = new URLSearchParams(searchParams.toString());
    params.set("contas", novas.join(","));
    router.push(`/dashboard?${params.toString()}`);
  }

  function selecionarTodas() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("contas");
    router.push(`/dashboard?${params.toString()}`);
  }

  if (todasContas.length <= 1) return null;

  const todasMarcadas = contasSelecionadas.length === todasContas.length;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase text-gray-400">Contas</span>
      <button
        onClick={selecionarTodas}
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
            className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700 dark:text-gray-200"
          >
            <input type="checkbox" checked={marcado} onChange={() => alternarConta(c.id)} />
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.cor }} />
            {c.nickname}
          </label>
        );
      })}
    </div>
  );
}
