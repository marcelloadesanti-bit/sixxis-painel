"use client";

import { useState } from "react";
import Link from "next/link";
import { formatarData } from "@/lib/date-utils";

type Canal = { id: string; nome: string; cor: string };
type FechamentoResumo = { id: string; rotulo: string; periodo_de: string; periodo_ate: string; fechado_em: string };

type ItemVendas = {
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

type CanalForm = {
  vendasBrutas: string;
  faturamentoBruto: string;
  vendasCanceladas: string;
  valorCancelado: string;
  vendasDevolvidas: string;
  valorDevolvido: string;
};

type AdsForm = { investimento: string; retorno: string; vendas: string; impressoes: string; cliques: string };

const CANAL_VAZIO: CanalForm = {
  vendasBrutas: "",
  faturamentoBruto: "",
  vendasCanceladas: "",
  valorCancelado: "",
  vendasDevolvidas: "",
  valorDevolvido: "",
};
const ADS_VAZIO: AdsForm = { investimento: "", retorno: "", vendas: "", impressoes: "", cliques: "" };

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function numero(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Sugere um rotulo tipo "Julho/2026" quando o periodo escolhido bate
// exatamente com um mes cheio; senao deixa em branco pro usuario descrever.
function sugerirRotulo(de: string, ate: string): string {
  if (!de || !ate) return "";
  const [ano, mes, dia] = de.split("-").map(Number);
  const ultimoDia = new Date(ano, mes, 0).getDate();
  const ateEsperado = `${ano}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  if (dia !== 1 || ate !== ateEsperado) return "";
  const nomesMeses = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  return `${nomesMeses[mes - 1]}/${ano}`;
}

export default function FechamentoClient({
  canais,
  fechamentosExistentes,
  podeEditar,
}: {
  canais: Canal[];
  fechamentosExistentes: FechamentoResumo[];
  podeEditar: boolean;
}) {
  const hoje = new Date();
  const primeiroDiaMesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const ultimoDiaMesPassado = new Date(hoje.getFullYear(), hoje.getMonth(), 0);

  const [periodoDe, setPeriodoDe] = useState(formatarData(primeiroDiaMesPassado));
  const [periodoAte, setPeriodoAte] = useState(formatarData(ultimoDiaMesPassado));
  const [rotulo, setRotulo] = useState(sugerirRotulo(formatarData(primeiroDiaMesPassado), formatarData(ultimoDiaMesPassado)));

  const [canaisForm, setCanaisForm] = useState<Record<string, CanalForm>>(
    Object.fromEntries(canais.map((c) => [c.id, { ...CANAL_VAZIO }]))
  );
  const [adsForm, setAdsForm] = useState<{ google_ads: AdsForm; meta_ads: AdsForm }>({
    google_ads: { ...ADS_VAZIO },
    meta_ads: { ...ADS_VAZIO },
  });

  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [itensAuto, setItensAuto] = useState<ItemVendas[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [fechando, setFechando] = useState(false);
  const [fechamentoConcluido, setFechamentoConcluido] = useState<string | null>(null);
  const [historico, setHistorico] = useState(fechamentosExistentes);

  function definirPeriodo(de: Date, ate: Date) {
    const deStr = formatarData(de);
    const ateStr = formatarData(ate);
    setPeriodoDe(deStr);
    setPeriodoAte(ateStr);
    setRotulo(sugerirRotulo(deStr, ateStr));
    setItensAuto(null);
    setFechamentoConcluido(null);
  }

  function periodoJaFechado(): FechamentoResumo | undefined {
    return historico.find((f) => f.periodo_de === periodoDe && f.periodo_ate === periodoAte);
  }

  async function buscarPreview() {
    setCarregandoPreview(true);
    setErro(null);
    try {
      const res = await fetch(`/api/sige/relatorio?tipo=vendas&de=${periodoDe}&ate=${periodoAte}`);
      const data = await res.json();
      if (!res.ok) {
        setErro(data.erro ?? "Falha ao buscar dados do periodo.");
        return;
      }
      setItensAuto(data.itens);
    } catch {
      setErro("Falha ao buscar dados do periodo.");
    } finally {
      setCarregandoPreview(false);
    }
  }

  async function fechar() {
    if (!rotulo.trim()) {
      setErro("Informe um rotulo para o fechamento (ex: Julho/2026).");
      return;
    }
    setFechando(true);
    setErro(null);
    try {
      const res = await fetch("/api/sige/fechamento", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodoDe,
          periodoAte,
          rotulo,
          canaisManuais: canais.map((c) => ({
            canalId: c.id,
            vendasBrutas: numero(canaisForm[c.id]?.vendasBrutas ?? ""),
            faturamentoBruto: numero(canaisForm[c.id]?.faturamentoBruto ?? ""),
            vendasCanceladas: numero(canaisForm[c.id]?.vendasCanceladas ?? ""),
            valorCancelado: numero(canaisForm[c.id]?.valorCancelado ?? ""),
            vendasDevolvidas: numero(canaisForm[c.id]?.vendasDevolvidas ?? ""),
            valorDevolvido: numero(canaisForm[c.id]?.valorDevolvido ?? ""),
          })),
          adsManuais: (["google_ads", "meta_ads"] as const).map((plataforma) => ({
            plataforma,
            investimento: numero(adsForm[plataforma].investimento),
            retorno: numero(adsForm[plataforma].retorno),
            vendas: numero(adsForm[plataforma].vendas),
            impressoes: numero(adsForm[plataforma].impressoes),
            cliques: numero(adsForm[plataforma].cliques),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErro(data.erro ?? "Falha ao fechar o periodo.");
        return;
      }
      setFechamentoConcluido(data.id);
      setHistorico((prev) => [{ id: data.id, rotulo, periodo_de: periodoDe, periodo_ate: periodoAte, fechado_em: new Date().toISOString() }, ...prev]);
    } catch {
      setErro("Falha ao fechar o periodo.");
    } finally {
      setFechando(false);
    }
  }

  const jaFechado = periodoJaFechado();

  return (
    <div>
      <div className="mb-6 rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Período do fechamento</p>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              const de = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
              const ate = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
              definirPeriodo(de, ate);
            }}
            className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Mês passado
          </button>
          <button
            onClick={() => {
              const de = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
              const ate = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
              definirPeriodo(de, ate);
            }}
            className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            Este mês
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600">
            De
            <input
              type="date"
              value={periodoDe}
              onChange={(e) => {
                setPeriodoDe(e.target.value);
                setRotulo(sugerirRotulo(e.target.value, periodoAte));
                setItensAuto(null);
                setFechamentoConcluido(null);
              }}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Até
            <input
              type="date"
              value={periodoAte}
              onChange={(e) => {
                setPeriodoAte(e.target.value);
                setRotulo(sugerirRotulo(periodoDe, e.target.value));
                setItensAuto(null);
                setFechamentoConcluido(null);
              }}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            Rótulo
            <input
              type="text"
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
              placeholder="ex: Julho/2026"
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
        </div>

        {jaFechado && (
          <p className="mb-3 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            Esse período exato já foi fechado ({jaFechado.rotulo}) em{" "}
            {new Date(jaFechado.fechado_em).toLocaleDateString("pt-BR")}. Veja no Histórico de Desempenho.
          </p>
        )}

        <button
          onClick={buscarPreview}
          disabled={carregandoPreview}
          className="rounded border border-[var(--color-sixxis-blue)] px-4 py-2 text-sm font-medium text-[var(--color-sixxis-blue)] hover:bg-blue-50 disabled:opacity-50"
        >
          {carregandoPreview ? "Buscando..." : "Buscar dados automáticos (ML + Amazon)"}
        </button>
      </div>

      <div className="mb-6 rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 text-xs font-semibold uppercase text-gray-500">Canais manuais (Shopee, TikTok Shop, etc)</p>
        {canais.length === 0 && <p className="text-sm text-gray-400">Nenhum canal manual cadastrado.</p>}
        <div className="flex flex-col gap-4">
          {canais.map((c) => (
            <div key={c.id} className="rounded border border-gray-100 p-3 dark:border-gray-700">
              <p className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.cor }} />
                {c.nome}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                {(
                  [
                    ["vendasBrutas", "Vendas brutas"],
                    ["faturamentoBruto", "Faturamento bruto"],
                    ["vendasCanceladas", "Vendas canceladas"],
                    ["valorCancelado", "Valor cancelado"],
                    ["vendasDevolvidas", "Vendas devolvidas"],
                    ["valorDevolvido", "Valor devolvido"],
                  ] as [keyof CanalForm, string][]
                ).map(([campo, label]) => (
                  <label key={campo} className="flex flex-col text-xs text-gray-500">
                    {label}
                    <input
                      type="number"
                      value={canaisForm[c.id]?.[campo] ?? ""}
                      onChange={(e) =>
                        setCanaisForm((prev) => ({ ...prev, [c.id]: { ...prev[c.id], [campo]: e.target.value } }))
                      }
                      className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-6 rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 text-xs font-semibold uppercase text-gray-500">Ads manuais (Google Ads, Meta Ads)</p>
        <div className="flex flex-col gap-4">
          {(["google_ads", "meta_ads"] as const).map((plataforma) => (
            <div key={plataforma} className="rounded border border-gray-100 p-3 dark:border-gray-700">
              <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                {plataforma === "google_ads" ? "Google Ads" : "Meta Ads"}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                {(
                  [
                    ["investimento", "Investimento"],
                    ["retorno", "Retorno"],
                    ["vendas", "Vendas"],
                    ["impressoes", "Impressões"],
                    ["cliques", "Cliques"],
                  ] as [keyof AdsForm, string][]
                ).map(([campo, label]) => (
                  <label key={campo} className="flex flex-col text-xs text-gray-500">
                    {label}
                    <input
                      type="number"
                      value={adsForm[plataforma][campo]}
                      onChange={(e) =>
                        setAdsForm((prev) => ({ ...prev, [plataforma]: { ...prev[plataforma], [campo]: e.target.value } }))
                      }
                      className="mt-1 rounded border border-gray-300 px-2 py-1 text-sm"
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {itensAuto && (
        <div className="mb-6 overflow-x-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                <th className="p-3">Conta (automático)</th>
                <th className="p-3 text-right">Vendas brutas</th>
                <th className="p-3 text-right">Faturamento bruto</th>
                <th className="p-3 text-right">Faturamento líquido</th>
              </tr>
            </thead>
            <tbody>
              {itensAuto.map((i) => (
                <tr key={i.id} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                  <td className="p-3">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: i.cor }} />
                    {i.nome}
                    {i.erro && <span className="ml-2 text-xs text-red-500">({i.erro})</span>}
                  </td>
                  <td className="p-3 text-right">{i.vendasBrutas}</td>
                  <td className="p-3 text-right">{formatarMoeda(i.faturamentoBruto)}</td>
                  <td className="p-3 text-right font-medium">{formatarMoeda(i.faturamentoLiquido)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {erro && <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{erro}</p>}

      {fechamentoConcluido ? (
        <div className="mb-6 rounded border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          Fechamento gravado com sucesso.{" "}
          <Link href="/dashboard/sige/historico" className="underline">
            Ver no Histórico de Desempenho
          </Link>
          .
        </div>
      ) : (
        podeEditar && (
          <button
            onClick={fechar}
            disabled={fechando || !!jaFechado}
            className="mb-8 rounded bg-[var(--color-sixxis-navy)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {fechando ? "Fechando..." : "Fechar período"}
          </button>
        )
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Fechamentos já realizados</p>
        {historico.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum fechamento realizado ainda.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
            {historico.map((f) => (
              <li key={f.id} className="flex items-center justify-between p-3 text-sm">
                <span className="font-medium text-gray-700 dark:text-gray-200">{f.rotulo}</span>
                <span className="text-xs text-gray-400">
                  {f.periodo_de} a {f.periodo_ate}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
