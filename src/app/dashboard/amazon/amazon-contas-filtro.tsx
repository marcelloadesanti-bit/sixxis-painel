"use client";

import { useRouter, useSearchParams } from "next/navigation";

type ContaOpcao = { id: string; nome: string; cor: string };

// Filtro de contas compartilhado por Amazon > Vendas e Amazon > Faturamento,
// no mesmo padrao (checkbox + bolinha + "Consolidado (todas)") ja usado em
// Resumo, SIGE e Anuncios. Aplica na hora (sem precisar clicar em "Aplicar"),
// preservando os demais parametros da URL (ex: de/ate do periodo).
export default function AmazonContasFiltro({
  contas,
  contasSelecionadas,
  baseHref,
}: {
  contas: ContaOpcao[];
  contasSelecionadas: string[];
  baseHref: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navegarComContas(ids: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    if (ids.length === 0 || ids.length === contas.length) {
      params.delete("contas");
    } else {
      params.set("contas", ids.join(","));
    }
    router.push(`${baseHref}?${params.toString()}`);
  }

  function alternarConta(contaId: string) {
    const atual = new Set(contasSelecionadas);
    if (atual.has(contaId)) {
      atual.delete(contaId);
    } else {
      atual.add(contaId);
    }
    const novas = atual.size > 0 ? Array.from(atual) : contas.map((c) => c.id);
    navegarComContas(novas);
  }

  if (contas.length <= 1) return null;

  const todasMarcadas = contasSelecionadas.length === contas.length;

  return (
    <div className="mb-4">
      <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Contas</p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => navegarComContas(contas.map((c) => c.id))}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${
            todasMarcadas
              ? "bg-[var(--color-sixxis-navy)] text-white"
              : "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          }`}
        >
          Consolidado (todas)
        </button>
        {contas.map((c) => {
          const marcado = contasSelecionadas.includes(c.id);
          return (
            <label
              key={c.id}
              className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:text-gray-200"
            >
              <input type="checkbox" checked={marcado} onChange={() => alternarConta(c.id)} />
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.cor }} />
              {c.nome}
            </label>
          );
        })}
      </div>
    </div>
  );
}
