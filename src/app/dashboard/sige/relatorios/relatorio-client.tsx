"use client";

import { useState } from "react";
import { PRESETS, periodoDoPreset, formatarData, type PresetKey } from "@/lib/date-utils";

type ContaOpcao = { id: string; nome: string; cor: string };

type ItemRelatorio = {
  id: string;
  tipo: "ml" | "amazon" | "manual";
  nome: string;
  cor: string;
  vendasBrutas: number;
  faturamentoBruto: number;
  vendasCanceladas: number;
  valorCancelado: number;
  vendasDevolvidas: number;
  valorDevolvido: number;
  vendasLiquidas: number;
  faturamentoLiquido: number;
  erro?: string;
};

type Resultado = {
  periodo: { de: string; ate: string };
  consolidado: Omit<ItemRelatorio, "id" | "tipo" | "nome" | "cor" | "erro">;
  itens: ItemRelatorio[];
};

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const TIPOS_RELATORIO: { key: string; label: string; disponivel: boolean }[] = [
  { key: "vendas", label: "Vendas", disponivel: true },
  { key: "visitas", label: "Visitas", disponivel: false },
  { key: "publicidade", label: "Publicidade / Investimento / Retorno", disponivel: false },
];

export default function RelatorioClient({ contas }: { contas: ContaOpcao[] }) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set(contas.map((c) => c.id)));
  const [preset, setPreset] = useState<PresetKey>("7dias");
  const [deCustom, setDeCustom] = useState(formatarData(new Date(Date.now() - 6 * 86400000)));
  const [ateCustom, setAteCustom] = useState(formatarData(new Date()));
  const [tipo, setTipo] = useState("vendas");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  function alternarConta(id: string) {
    setSelecionadas((prev) => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  const todasSelecionadas = selecionadas.size === contas.length;

  function alternarTodas() {
    setSelecionadas(todasSelecionadas ? new Set() : new Set(contas.map((c) => c.id)));
  }

  async function gerar() {
    setCarregando(true);
    setErro(null);
    setResultado(null);

    const { de, ate } =
      preset === "personalizado" ? { de: deCustom, ate: ateCustom } : periodoDoPreset(preset, new Date());

    const params = new URLSearchParams({ tipo, de, ate });
    if (selecionadas.size > 0 && selecionadas.size < contas.length) {
      params.set("contas", Array.from(selecionadas).join(","));
    }

    try {
      const res = await fetch(`/api/sige/relatorio?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setErro(data.erro ?? "Falha ao gerar relatório.");
        return;
      }
      setResultado(data);
    } catch {
      setErro("Falha ao gerar relatório.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div>
      <div className="mb-6 rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Tipo de relatório</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {TIPOS_RELATORIO.map((t) => (
            <button
              key={t.key}
              disabled={!t.disponivel}
              onClick={() => setTipo(t.key)}
              title={t.disponivel ? undefined : "Em breve"}
              className={`rounded-full px-3 py-1.5 text-sm ${
                tipo === t.key
                  ? "bg-[var(--color-sixxis-navy)] text-white"
                  : t.disponivel
                    ? "border border-gray-300 text-gray-600 hover:bg-gray-50"
                    : "cursor-not-allowed border border-gray-200 text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Período</p>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPreset(p.key)}
              className={`rounded-full px-3 py-1.5 text-sm ${
                preset === p.key
                  ? "bg-[var(--color-sixxis-navy)] text-white"
                  : "border border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            onClick={() => setPreset("personalizado")}
            className={`rounded-full px-3 py-1.5 text-sm ${
              preset === "personalizado"
                ? "bg-[var(--color-sixxis-navy)] text-white"
                : "border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Personalizado
          </button>
          {preset === "personalizado" && (
            <span className="flex items-center gap-2">
              <input
                type="date"
                value={deCustom}
                onChange={(e) => setDeCustom(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <span className="text-gray-400">até</span>
              <input
                type="date"
                value={ateCustom}
                onChange={(e) => setAteCustom(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </span>
          )}
        </div>

        <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Contas</p>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={alternarTodas}
            className={`rounded-full px-3 py-1.5 text-sm ${
              todasSelecionadas
                ? "bg-[var(--color-sixxis-navy)] text-white"
                : "border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Todas
          </button>
          {contas.map((c) => (
            <button
              key={c.id}
              onClick={() => alternarConta(c.id)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                selecionadas.has(c.id) ? "border-transparent text-white" : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
              style={selecionadas.has(c.id) ? { backgroundColor: c.cor } : undefined}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.cor }} />
              {c.nome}
            </button>
          ))}
          {contas.length === 0 && <p className="text-sm text-gray-400">Nenhuma conta disponível.</p>}
        </div>

        <button
          onClick={gerar}
          disabled={carregando || selecionadas.size === 0}
          className="rounded bg-[var(--color-sixxis-blue)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {carregando ? "Gerando..." : "Gerar relatório"}
        </button>
      </div>

      {erro && <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{erro}</p>}

      {resultado && (
        <div>
          <p className="mb-2 text-xs text-gray-400">
            Período: {resultado.periodo.de} a {resultado.periodo.ate}
          </p>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs text-gray-500">Vendas brutas</p>
              <p className="text-lg font-semibold text-gray-800 dark:text-white">{resultado.consolidado.vendasBrutas}</p>
            </div>
            <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs text-gray-500">Faturamento bruto</p>
              <p className="text-lg font-semibold text-gray-800 dark:text-white">
                {formatarMoeda(resultado.consolidado.faturamentoBruto)}
              </p>
            </div>
            <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs text-gray-500">Vendas líquidas</p>
              <p className="text-lg font-semibold text-gray-800 dark:text-white">{resultado.consolidado.vendasLiquidas}</p>
            </div>
            <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <p className="text-xs text-gray-500">Faturamento líquido</p>
              <p className="text-lg font-semibold text-gray-800 dark:text-white">
                {formatarMoeda(resultado.consolidado.faturamentoLiquido)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                  <th className="p-3">Conta</th>
                  <th className="p-3 text-right">Vendas brutas</th>
                  <th className="p-3 text-right">Faturamento bruto</th>
                  <th className="p-3 text-right">Cancelados</th>
                  <th className="p-3 text-right">Devolvidos</th>
                  <th className="p-3 text-right">Vendas líquidas</th>
                  <th className="p-3 text-right">Faturamento líquido</th>
                </tr>
              </thead>
              <tbody>
                {resultado.itens.map((i) => (
                  <tr key={i.id} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                    <td className="p-3">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: i.cor }} />
                      {i.nome}
                      {i.erro && <span className="ml-2 text-xs text-red-500">({i.erro})</span>}
                    </td>
                    <td className="p-3 text-right">{i.vendasBrutas}</td>
                    <td className="p-3 text-right">{formatarMoeda(i.faturamentoBruto)}</td>
                    <td className="p-3 text-right">
                      {i.vendasCanceladas} · {formatarMoeda(i.valorCancelado)}
                    </td>
                    <td className="p-3 text-right">
                      {i.vendasDevolvidas} · {formatarMoeda(i.valorDevolvido)}
                    </td>
                    <td className="p-3 text-right">{i.vendasLiquidas}</td>
                    <td className="p-3 text-right font-medium">{formatarMoeda(i.faturamentoLiquido)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
