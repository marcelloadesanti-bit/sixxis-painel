"use client";

import { useRouter, useSearchParams } from "next/navigation";

// 27/07/2026: seletor de mês para consultar períodos de faturamento
// anteriores (não só o mais recente). Ao trocar, navega para a mesma página
// com ?mes=<key> (ex: "2026-06-01") -- a página server-side já sabe buscar
// (com cache permanente, já que período fechado não muda mais).
export default function SeletorMes({ meses }: { meses: { key: string; label: string }[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selecionado = searchParams.get("mes") ?? "ATUAL";

  return (
    <select
      value={selecionado}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("atualizar");
        if (e.target.value === "ATUAL") {
          params.delete("mes");
        } else {
          params.set("mes", e.target.value);
        }
        const query = params.toString();
        router.push(`/dashboard/faturamento${query ? `?${query}` : ""}`);
      }}
      className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
    >
      <option value="ATUAL">Período mais recente</option>
      {meses.map((m) => (
        <option key={m.key} value={m.key}>
          {m.label}
        </option>
      ))}
    </select>
  );
}
