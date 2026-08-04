"use client";

import { useMemo, useState } from "react";
import { GRUPOS, grupoDaCategoria, type GrupoId } from "@/lib/estoque/grupos";

export type LinhaMetrica = {
  sku: string;
  categoria: string;
  descricao: string;
  saldoTotal: number;
  saldoLoja: number;
  saldoFull: number;
  quantidade60d: number;
  velocidadeDiaria: number;
  diasAteRuptura: number | null;
  nivel: "critico" | "atencao" | "ok" | "sem_venda";
  proximaChegada: { data: string; quantidade: number } | null;
};

type Consolidado = { totalSkus: number; saldoTotal: number; criticos: number; atencao: number };

function corNivel(nivel: LinhaMetrica["nivel"]) {
  switch (nivel) {
    case "critico":
      return { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", label: "Crítico" };
    case "atencao":
      return { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300", label: "Atenção" };
    case "ok":
      return { bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300", label: "OK" };
    default:
      return { bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-500 dark:text-gray-400", label: "Sem venda" };
  }
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function calcularConsolidado(linhas: LinhaMetrica[]): Consolidado {
  return {
    totalSkus: linhas.length,
    saldoTotal: linhas.reduce((s, l) => s + l.saldoTotal, 0),
    criticos: linhas.filter((l) => l.nivel === "critico").length,
    atencao: linhas.filter((l) => l.nivel === "atencao").length,
  };
}

export default function MetricasEstoquePainel({
  linhas,
  consolidado,
}: {
  linhas: LinhaMetrica[];
  categorias: string[];
  consolidado: Consolidado;
}) {
  const [grupoSelecionado, setGrupoSelecionado] = useState<GrupoId | null>(null);

  const statsPorGrupo = useMemo(() => {
    const mapa = new Map<GrupoId, Consolidado>();
    for (const g of GRUPOS) {
      const linhasDoGrupo = linhas.filter((l) => grupoDaCategoria(l.categoria) === g.id);
      mapa.set(g.id, calcularConsolidado(linhasDoGrupo));
    }
    return mapa;
  }, [linhas]);

  const linhasFiltradas = useMemo(() => {
    if (!grupoSelecionado) return linhas;
    return linhas.filter((l) => grupoDaCategoria(l.categoria) === grupoSelecionado);
  }, [linhas, grupoSelecionado]);

  function alternarGrupo(id: GrupoId) {
    setGrupoSelecionado((atual) => (atual === id ? null : id));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-sixxis-navy)] dark:text-white">
          Consolidado geral
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="SKUs" valor={consolidado.totalSkus} />
          <Stat label="Saldo total" valor={consolidado.saldoTotal.toLocaleString("pt-BR")} />
          <Stat label="Críticos" valor={consolidado.criticos} destaque="text-red-600 dark:text-red-400" />
          <Stat label="Atenção" valor={consolidado.atencao} destaque="text-amber-600 dark:text-amber-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {GRUPOS.map((g) => {
          const stats = statsPorGrupo.get(g.id) ?? { totalSkus: 0, saldoTotal: 0, criticos: 0, atencao: 0 };
          const ativo = grupoSelecionado === g.id;
          return (
            <button
              key={g.id}
              onClick={() => alternarGrupo(g.id)}
              className={`rounded-xl border p-4 text-left shadow-sm transition ${
                ativo
                  ? "border-[var(--color-sixxis-navy)] bg-[var(--color-sixxis-navy)] text-white"
                  : "border-gray-200 bg-white hover:border-gray-300 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-700"
              }`}
            >
              <div className={`text-sm font-semibold ${ativo ? "text-white" : "text-[var(--color-sixxis-navy)] dark:text-white"}`}>
                {g.labelCurto}
              </div>
              <div className={`mt-2 text-xs ${ativo ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>
                {stats.totalSkus} SKUs · {stats.saldoTotal.toLocaleString("pt-BR")} unid.
              </div>
              <div className="mt-3 flex gap-4">
                <div>
                  <div className={`text-lg font-bold ${ativo ? "text-white" : "text-red-600 dark:text-red-400"}`}>
                    {stats.criticos}
                  </div>
                  <div className={`text-xs ${ativo ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>Críticos</div>
                </div>
                <div>
                  <div className={`text-lg font-bold ${ativo ? "text-white" : "text-amber-600 dark:text-amber-400"}`}>
                    {stats.atencao}
                  </div>
                  <div className={`text-xs ${ativo ? "text-white/80" : "text-gray-500 dark:text-gray-400"}`}>Atenção</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setGrupoSelecionado(null)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
            grupoSelecionado === null
              ? "bg-[var(--color-sixxis-navy)] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
          }`}
        >
          Todos ({linhas.length})
        </button>
        {GRUPOS.map((g) => {
          const stats = statsPorGrupo.get(g.id) ?? { totalSkus: 0, saldoTotal: 0, criticos: 0, atencao: 0 };
          return (
            <button
              key={g.id}
              onClick={() => alternarGrupo(g.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                grupoSelecionado === g.id
                  ? "bg-[var(--color-sixxis-navy)] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {g.labelCurto} ({stats.totalSkus})
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3">Descrição</th>
              <th className="px-4 py-3 text-right">Saldo (loja/full)</th>
              <th className="px-4 py-3 text-right">Vendas 60d</th>
              <th className="px-4 py-3 text-right">Vel. diária</th>
              <th className="px-4 py-3 text-right">Dias até ruptura</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Container que resolve</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {linhasFiltradas.map((linha) => {
              const cor = corNivel(linha.nivel);
              return (
                <tr key={linha.sku} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900 dark:text-gray-100">
                    {linha.sku}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    <div className="max-w-xs truncate" title={linha.descricao}>
                      {linha.descricao}
                    </div>
                    <div className="text-xs text-gray-400">{linha.categoria}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    <div className="font-medium">{linha.saldoTotal.toLocaleString("pt-BR")}</div>
                    <div className="text-xs text-gray-400">
                      {linha.saldoLoja.toLocaleString("pt-BR")} / {linha.saldoFull.toLocaleString("pt-BR")}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {linha.quantidade60d.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {linha.velocidadeDiaria.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900 dark:text-gray-100">
                    {linha.diasAteRuptura === null ? "—" : `${linha.diasAteRuptura} dias`}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${cor.bg} ${cor.text}`}>
                      {cor.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                    {linha.proximaChegada ? (
                      <>
                        {formatarData(linha.proximaChegada.data)}{" "}
                        <span className="text-xs text-gray-400">
                          (+{linha.proximaChegada.quantidade.toLocaleString("pt-BR")})
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {linhasFiltradas.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">Nenhum SKU encontrado.</div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, valor, destaque }: { label: string; valor: string | number; destaque?: string }) {
  return (
    <div>
      <div className={`text-2xl font-bold ${destaque ?? "text-[var(--color-sixxis-navy)] dark:text-white"}`}>
        {valor}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}
