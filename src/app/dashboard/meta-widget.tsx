"use client";

import { useAoVivo } from "./ao-vivo-context";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function formatarMoedaCompacta(valor: number, moeda: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda || "BRL",
    maximumFractionDigits: 0,
  }).format(valor);
}

export default function MetaWidget({ isAdmin }: { isAdmin: boolean }) {
  const { dados, carregando } = useAoVivo();
  const meta = dados?.metaMes;

  // Evita "pulo" de layout antes do primeiro fetch terminar.
  if (carregando && !meta) return null;
  if (!meta) return null;

  if (meta.metaValor === null) {
    return (
      <div className="mb-4 rounded border border-dashed border-gray-300 bg-white px-4 py-2 text-xs text-gray-500 dark:border-gray-600 dark:bg-gray-800">
        Nenhuma meta definida para {MESES[meta.mes - 1]}.
        {isAdmin && (
          <>
            {" "}
            <a href="/dashboard/configuracoes/metas" className="text-[var(--color-sixxis-blue)] underline">
              Definir meta
            </a>
          </>
        )}
      </div>
    );
  }

  const hoje = new Date();
  const diasNoMes = new Date(meta.ano, meta.mes, 0).getDate();
  const diaAtual = Math.min(hoje.getDate(), diasNoMes);
  const pctTempo = Math.min(100, (diaAtual / diasNoMes) * 100);
  const pctMeta = meta.metaValor > 0 ? (meta.faturamento / meta.metaValor) * 100 : 0;
  const pctMetaBarra = Math.min(100, pctMeta);
  const noRitmo = pctMeta >= pctTempo;

  return (
    <div className="mb-4 rounded border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-xs font-medium uppercase text-gray-400">Meta de {MESES[meta.mes - 1]}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formatarMoedaCompacta(meta.faturamento, meta.moeda)} de{" "}
          {formatarMoedaCompacta(meta.metaValor, meta.moeda)}
          {" · "}
          <span className={`font-semibold ${noRitmo ? "text-green-600" : "text-red-500"}`}>
            {pctMeta.toFixed(1)}% da meta
          </span>{" "}
          <span className="text-gray-400">({pctTempo.toFixed(0)}% do mês decorrido)</span>
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${
            noRitmo ? "bg-green-500" : "bg-amber-500"
          }`}
          style={{ width: `${pctMetaBarra}%` }}
        />
        <div
          className="absolute inset-y-0 w-0.5 bg-gray-700 dark:bg-gray-300"
          style={{ left: `${pctTempo}%` }}
          title={`${pctTempo.toFixed(0)}% do mês decorrido`}
        />
      </div>
    </div>
  );
}
