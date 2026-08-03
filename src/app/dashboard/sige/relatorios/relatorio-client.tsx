"use client";

import { useEffect, useState } from "react";
import { PRESETS, periodoDoPreset, formatarData, type PresetKey } from "@/lib/date-utils";

type ContaOpcao = { id: string; nome: string; cor: string };

type ItemVendasRel = {
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

type ItemAdsRel = {
  id: string;
  tipo: "ml" | "manual";
  nome: string;
  cor: string;
  investimento: number;
  retorno: number;
  impressoes: number;
  cliques: number;
  roas: number | null;
  acos: number | null;
  tacos: number | null;
  ctr: number | null;
  erro?: string;
};

type IndicadorCrescimento = {
  nome: string;
  formato: "moeda" | "numero" | "pct" | "roas";
  valor: number;
  vsMesAnterior: number | null;
  vsAnoAnterior: number | null;
};

type LinhaHistoricoResumo = {
  mesChave: string;
  rotulo: string;
  totalFaturamento: number;
  totalVendas: number;
  investimentoAds: number;
  roas: number | null;
};

type ComercialInfo = { numeroVendas: number; valorTotal: number };

type ResultadoVendas = {
  tipo: "vendas";
  periodo: { de: string; ate: string };
  consolidado: Omit<ItemVendasRel, "id" | "tipo" | "nome" | "cor" | "erro">;
  itens: ItemVendasRel[];
  comercial?: ComercialInfo;
};

type ResultadoAds = {
  tipo: "ads";
  periodo: { de: string; ate: string };
  consolidado: Omit<ItemAdsRel, "id" | "tipo" | "nome" | "cor" | "erro"> & { faturamentoTotalEmpresa: number };
  itens: ItemAdsRel[];
};

type ResultadoCrescimento = {
  tipo: "crescimento";
  mesAtual: { rotulo: string; periodoDe: string; periodoAte: string; indicadores: IndicadorCrescimento[] } | null;
  historico: LinhaHistoricoResumo[];
};

type Resultado = ResultadoVendas | ResultadoAds | ResultadoCrescimento;

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarPct(v: number | null, casas = 1): string {
  return v !== null ? `${v.toFixed(casas)}%` : "—";
}

function formatarRoas(v: number | null): string {
  return v !== null ? `${v.toFixed(2)}x` : "—";
}

function formatarIndicador(i: IndicadorCrescimento): string {
  if (i.formato === "moeda") return formatarMoeda(i.valor);
  if (i.formato === "roas") return formatarRoas(i.valor);
  if (i.formato === "pct") return formatarPct(i.valor);
  return i.valor.toLocaleString("pt-BR");
}

function Variacao({ v }: { v: number | null }) {
  if (v === null) return <span className="text-gray-400">—</span>;
  const positivo = v >= 0;
  return (
    <span className={positivo ? "text-green-600" : "text-red-500"}>
      {positivo ? "▲" : "▼"} {Math.abs(v * 100).toFixed(1)}%
    </span>
  );
}

// Campos de assinatura -- aparecem só na versão impressa/PDF (Imprimir /
// Baixar PDF usa window.print(), não uma lib de PDF -- ver o bloco
// @media print no topo do componente). Puramente cosmético/acréscimo: não
// mexe em nenhum cálculo ou dado do relatório.
function BlocoAssinaturas() {
  return (
    <div className="mt-16 hidden grid-cols-2 gap-16 print:grid">
      <div className="text-center">
        <div className="h-12" />
        <div className="border-t border-gray-500 pt-2 text-xs text-gray-600">Assinatura do Colaborador</div>
      </div>
      <div className="text-center">
        <div className="h-12" />
        <div className="border-t border-gray-500 pt-2 text-xs text-gray-600">Assinatura do Patrão</div>
      </div>
    </div>
  );
}

const TIPOS_RELATORIO: { key: string; label: string; disponivel: boolean }[] = [
  { key: "vendas", label: "Vendas", disponivel: true },
  { key: "ads", label: "Publicidade / Investimento / Retorno", disponivel: true },
  { key: "crescimento", label: "Crescimento", disponivel: true },
  { key: "visitas", label: "Visitas", disponivel: false },
];

// Cor tiffany para distinguir o Comercial (vendas fechadas manualmente pelo
// setor comercial por dentro do ML, deduzidas do faturamento -- nao entram
// no comissionamento normal).
const COR_COMERCIAL = "#44e2d9";
const COR_COMERCIAL_TEXTO = "#0d7d76";

function mesAtualYYYYMM(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function numero(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function RelatorioClient({ contas, podeEditar }: { contas: ContaOpcao[]; podeEditar: boolean }) {
  // Por padrao, so contas Mercado Livre e Amazon ja integradas vem
  // selecionadas. Canais manuais (ex: Netshoes/Magalu, Shopee, TikTok Shop)
  // ficam visiveis na lista, mas fora de selecao, ate ganharem integracao
  // propria -- evita relatorio "sujo" com canais ainda sem dado real.
  const [selecionadas, setSelecionadas] = useState<Set<string>>(
    () => new Set(contas.filter((c) => c.id.startsWith("ml:") || c.id.startsWith("amazon:")).map((c) => c.id))
  );
  const [preset, setPreset] = useState<PresetKey>("7dias");
  const [deCustom, setDeCustom] = useState(formatarData(new Date(Date.now() - 6 * 86400000)));
  const [ateCustom, setAteCustom] = useState(formatarData(new Date()));
  const [tipo, setTipo] = useState("vendas");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // Card "Comercial" -- lancamento manual, um unico valor consolidado por
  // mes calendario (ver lib/sige/comercial.ts). Independente do periodo do
  // relatorio: o usuario escolhe o mes que esta lancando.
  const [comercialMesSel, setComercialMesSel] = useState(mesAtualYYYYMM);
  const [comercialNumeroVendas, setComercialNumeroVendas] = useState("");
  const [comercialValorTotal, setComercialValorTotal] = useState("");
  const [comercialCarregando, setComercialCarregando] = useState(false);
  const [comercialSalvando, setComercialSalvando] = useState(false);
  const [comercialErro, setComercialErro] = useState<string | null>(null);
  const [comercialSalvoEm, setComercialSalvoEm] = useState<string | null>(null);

  useEffect(() => {
    if (tipo !== "vendas") return;
    const [ano, mes] = comercialMesSel.split("-").map(Number);
    if (!ano || !mes) return;

    let cancelado = false;
    setComercialCarregando(true);
    setComercialErro(null);
    fetch(`/api/sige/comercial?ano=${ano}&mes=${mes}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (cancelado) return;
        if (!ok) {
          setComercialErro(data.erro ?? "Falha ao carregar o Comercial deste mês.");
          return;
        }
        setComercialNumeroVendas(data.numeroVendas ? String(data.numeroVendas) : "");
        setComercialValorTotal(data.valorTotal ? String(data.valorTotal) : "");
        setComercialSalvoEm(data.atualizadoEm ?? null);
      })
      .catch(() => {
        if (!cancelado) setComercialErro("Falha ao carregar o Comercial deste mês.");
      })
      .finally(() => {
        if (!cancelado) setComercialCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [comercialMesSel, tipo]);

  async function salvarComercial() {
    const [ano, mes] = comercialMesSel.split("-").map(Number);
    if (!ano || !mes) return;

    setComercialSalvando(true);
    setComercialErro(null);
    try {
      const res = await fetch("/api/sige/comercial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ano,
          mes,
          numeroVendas: numero(comercialNumeroVendas),
          valorTotal: numero(comercialValorTotal),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setComercialErro(data.erro ?? "Falha ao salvar.");
        return;
      }
      setComercialSalvoEm(new Date().toISOString());
      // Se ja existe um relatorio de Vendas gerado na tela, atualiza para
      // refletir o novo valor deduzido imediatamente.
      if (resultado?.tipo === "vendas") {
        gerar();
      }
    } catch {
      setComercialErro("Falha ao salvar.");
    } finally {
      setComercialSalvando(false);
    }
  }

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

    const params = new URLSearchParams({ tipo });

    // Crescimento le fechamentos ja congelados -- nao tem periodo nem
    // filtro de contas (equivalente a "Rel. Crescimento" da planilha, que
    // sempre mostra o ultimo mes fechado).
    if (tipo !== "crescimento") {
      const { de, ate } =
        preset === "personalizado" ? { de: deCustom, ate: ateCustom } : periodoDoPreset(preset, new Date());
      params.set("de", de);
      params.set("ate", ate);
      if (selecionadas.size > 0 && selecionadas.size < contas.length) {
        params.set("contas", Array.from(selecionadas).join(","));
      }
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

  const tituloRelatorio = TIPOS_RELATORIO.find((t) => t.key === (resultado?.tipo ?? tipo))?.label ?? "Relatório";
  const podeGerar = tipo === "crescimento" || selecionadas.size > 0;

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #relatorio-print, #relatorio-print * { visibility: visible; }
          #relatorio-print { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
          .print-hide { display: none !important; }
        }
      `}</style>

      <div className="mb-6 rounded border border-gray-200 bg-white p-4 print-hide dark:border-gray-700 dark:bg-gray-800">
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

        {tipo === "vendas" && (
          <div className="mb-4 rounded border-2 p-3" style={{ borderColor: COR_COMERCIAL, backgroundColor: `${COR_COMERCIAL}14` }}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase" style={{ color: COR_COMERCIAL_TEXTO }}>
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COR_COMERCIAL }} />
                Comercial (vendas fechadas manualmente por dentro do ML)
              </p>
              <label className="flex items-center gap-2 text-xs text-gray-500">
                Mês
                <input
                  type="month"
                  value={comercialMesSel}
                  onChange={(e) => setComercialMesSel(e.target.value)}
                  className="rounded border border-gray-300 px-2 py-1 text-sm"
                />
              </label>
            </div>
            <p className="mb-2 text-xs text-gray-500">
              Valor único consolidado da empresa para o mês selecionado — deduzido do faturamento neste relatório, no
              Fechamento Mensal e no cálculo de Comissão do gestor.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-xs text-gray-500">
                Nº de vendas
                <input
                  type="number"
                  min={0}
                  value={comercialNumeroVendas}
                  onChange={(e) => setComercialNumeroVendas(e.target.value)}
                  disabled={!podeEditar || comercialCarregando}
                  className="mt-1 w-32 rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
                />
              </label>
              <label className="flex flex-col text-xs text-gray-500">
                Valor total (R$)
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={comercialValorTotal}
                  onChange={(e) => setComercialValorTotal(e.target.value)}
                  disabled={!podeEditar || comercialCarregando}
                  className="mt-1 w-40 rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
                />
              </label>
              {podeEditar && (
                <button
                  onClick={salvarComercial}
                  disabled={comercialSalvando || comercialCarregando}
                  className="rounded px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: COR_COMERCIAL_TEXTO }}
                >
                  {comercialSalvando ? "Salvando..." : "Salvar"}
                </button>
              )}
              {comercialCarregando && <span className="text-xs text-gray-400">Carregando...</span>}
              {comercialSalvoEm && !comercialCarregando && (
                <span className="text-xs text-gray-400">
                  Salvo em {new Date(comercialSalvoEm).toLocaleString("pt-BR")}
                </span>
              )}
            </div>
            {comercialErro && <p className="mt-2 text-xs text-red-500">{comercialErro}</p>}
          </div>
        )}

        {tipo === "crescimento" ? (
          <p className="mb-4 text-xs text-gray-400">
            Este relatório usa os fechamentos mensais já concluídos (não tem período nem filtro de contas) --
            compara o último mês fechado com o mês anterior e o mesmo mês do ano anterior.
          </p>
        ) : (
          <>
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
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                onClick={alternarTodas}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                  todasSelecionadas
                    ? "bg-[var(--color-sixxis-navy)] text-white"
                    : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Consolidado (todas)
              </button>
              {contas.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200"
                >
                  <input type="checkbox" checked={selecionadas.has(c.id)} onChange={() => alternarConta(c.id)} />
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.cor }} />
                  {c.nome}
                </label>
              ))}
              {contas.length === 0 && <p className="text-sm text-gray-400">Nenhuma conta disponível.</p>}
            </div>
            {tipo === "ads" && (
              <p className="mb-4 text-xs text-gray-400">
                O filtro de contas acima vale só para o Mercado Ads de cada conta ML. Google Ads e Meta Ads (lançados
                no Fechamento Mensal) sempre entram no relatório, independente da seleção.
              </p>
            )}
          </>
        )}

        <button
          onClick={gerar}
          disabled={carregando || !podeGerar}
          className="rounded bg-[var(--color-sixxis-blue)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {carregando ? "Gerando..." : "Gerar relatório"}
        </button>
      </div>

      {erro && <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600 print-hide">{erro}</p>}

      {resultado && (
        <div id="relatorio-print">
          <div className="mb-2 hidden print:block">
            <h2 className="text-lg font-bold text-gray-900">SIXXIS · SIGE · Relatório de {tituloRelatorio}</h2>
            <p className="text-xs text-gray-500">Gerado em {new Date().toLocaleString("pt-BR")}</p>
          </div>

          {resultado.tipo !== "crescimento" && (
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs text-gray-400">
                Período: {resultado.periodo.de} a {resultado.periodo.ate}
              </p>
              <button
                onClick={() => window.print()}
                className="print-hide rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300"
              >
                Imprimir / Baixar PDF
              </button>
            </div>
          )}

          {resultado.tipo === "vendas" ? (
            <>
              <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
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
                  <p className="text-xs text-gray-500">
                    Faturamento líquido{(resultado.comercial?.valorTotal ?? 0) > 0 ? " (após Comercial)" : ""}
                  </p>
                  <p className="text-lg font-semibold text-gray-800 dark:text-white">
                    {formatarMoeda(resultado.consolidado.faturamentoLiquido - (resultado.comercial?.valorTotal ?? 0))}
                  </p>
                  {(resultado.comercial?.valorTotal ?? 0) > 0 && (
                    <p className="mt-1 text-[11px] text-gray-400">
                      Bruto (sem Comercial): {formatarMoeda(resultado.consolidado.faturamentoLiquido)}
                    </p>
                  )}
                </div>
                <div className="rounded border p-4" style={{ borderColor: COR_COMERCIAL, backgroundColor: `${COR_COMERCIAL}14` }}>
                  <p className="text-xs font-medium" style={{ color: COR_COMERCIAL_TEXTO }}>
                    Comercial
                  </p>
                  <p className="text-lg font-semibold" style={{ color: COR_COMERCIAL_TEXTO }}>
                    {formatarMoeda(resultado.comercial?.valorTotal ?? 0)}
                  </p>
                  <p className="mt-1 text-[11px]" style={{ color: COR_COMERCIAL_TEXTO }}>
                    {resultado.comercial?.numeroVendas ?? 0} vendas · já deduzido acima
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
                    {(resultado.comercial?.valorTotal ?? 0) > 0 && (
                      <tr className="border-b border-gray-100 last:border-0 dark:border-gray-700" style={{ backgroundColor: `${COR_COMERCIAL}14` }}>
                        <td className="p-3">
                          <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: COR_COMERCIAL }} />
                          Comercial (dedução manual)
                        </td>
                        <td className="p-3 text-right">{resultado.comercial?.numeroVendas ?? 0}</td>
                        <td className="p-3 text-right">—</td>
                        <td className="p-3 text-right">—</td>
                        <td className="p-3 text-right">—</td>
                        <td className="p-3 text-right">—</td>
                        <td className="p-3 text-right font-medium" style={{ color: COR_COMERCIAL_TEXTO }}>
                          -{formatarMoeda(resultado.comercial?.valorTotal ?? 0)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <BlocoAssinaturas />
            </>
          ) : resultado.tipo === "ads" ? (
            <>
              <div className="mb-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500">Investimento</p>
                  <p className="text-lg font-semibold text-gray-800 dark:text-white">
                    {formatarMoeda(resultado.consolidado.investimento)}
                  </p>
                </div>
                <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500">Retorno</p>
                  <p className="text-lg font-semibold text-gray-800 dark:text-white">
                    {formatarMoeda(resultado.consolidado.retorno)}
                  </p>
                </div>
                <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500">ROAS</p>
                  <p className="text-lg font-semibold text-gray-800 dark:text-white">
                    {formatarRoas(resultado.consolidado.roas)}
                  </p>
                </div>
                <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500">ACOS</p>
                  <p className="text-lg font-semibold text-gray-800 dark:text-white">
                    {formatarPct(resultado.consolidado.acos)}
                  </p>
                </div>
                <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500">TACOS</p>
                  <p className="text-lg font-semibold text-gray-800 dark:text-white">
                    {formatarPct(resultado.consolidado.tacos)}
                  </p>
                </div>
                <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500">Impressões</p>
                  <p className="text-lg font-semibold text-gray-800 dark:text-white">
                    {resultado.consolidado.impressoes.toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500">Cliques</p>
                  <p className="text-lg font-semibold text-gray-800 dark:text-white">
                    {resultado.consolidado.cliques.toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-xs text-gray-500">CTR</p>
                  <p className="text-lg font-semibold text-gray-800 dark:text-white">
                    {formatarPct(resultado.consolidado.ctr, 2)}
                  </p>
                </div>
              </div>
              <p className="mb-6 text-xs text-gray-400">
                TACOS calculado sobre o faturamento bruto total da empresa no período (
                {formatarMoeda(resultado.consolidado.faturamentoTotalEmpresa)}), não só as vendas via ads.
              </p>

              <div className="overflow-x-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                      <th className="p-3">Conta</th>
                      <th className="p-3 text-right">Investimento</th>
                      <th className="p-3 text-right">Retorno</th>
                      <th className="p-3 text-right">ROAS</th>
                      <th className="p-3 text-right">ACOS</th>
                      <th className="p-3 text-right">TACOS</th>
                      <th className="p-3 text-right">Impressões</th>
                      <th className="p-3 text-right">Cliques</th>
                      <th className="p-3 text-right">CTR</th>
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
                        <td className="p-3 text-right">{formatarMoeda(i.investimento)}</td>
                        <td className="p-3 text-right">{formatarMoeda(i.retorno)}</td>
                        <td className="p-3 text-right">{formatarRoas(i.roas)}</td>
                        <td className="p-3 text-right">{formatarPct(i.acos)}</td>
                        <td className="p-3 text-right">{formatarPct(i.tacos)}</td>
                        <td className="p-3 text-right">{i.impressoes.toLocaleString("pt-BR")}</td>
                        <td className="p-3 text-right">{i.cliques.toLocaleString("pt-BR")}</td>
                        <td className="p-3 text-right font-medium">{formatarPct(i.ctr, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <BlocoAssinaturas />
            </>
          ) : (
            <>
              {resultado.mesAtual === null ? (
                <p className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400 dark:border-gray-600">
                  Nenhum fechamento realizado ainda.{" "}
                  <a href="/dashboard/sige/fechamento" className="underline">
                    Fazer o primeiro fechamento
                  </a>
                  .
                </p>
              ) : (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs text-gray-400">
                      Performance do mês: {resultado.mesAtual.rotulo} ({resultado.mesAtual.periodoDe} a{" "}
                      {resultado.mesAtual.periodoAte})
                    </p>
                    <button
                      onClick={() => window.print()}
                      className="print-hide rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300"
                    >
                      Imprimir / Baixar PDF
                    </button>
                  </div>

                  <div className="mb-8 overflow-x-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                          <th className="p-3">Indicador</th>
                          <th className="p-3 text-right">Valor</th>
                          <th className="p-3 text-right">vs Mês Ant.</th>
                          <th className="p-3 text-right">vs Ano Ant.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.mesAtual.indicadores.map((i) => (
                          <tr key={i.nome} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                            <td className="p-3 font-medium">{i.nome}</td>
                            <td className="p-3 text-right">{formatarIndicador(i)}</td>
                            <td className="p-3 text-right">
                              <Variacao v={i.vsMesAnterior} />
                            </td>
                            <td className="p-3 text-right">
                              <Variacao v={i.vsAnoAnterior} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Histórico — últimos 12 meses</p>
                  <div className="overflow-x-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                          <th className="p-3">Mês</th>
                          <th className="p-3 text-right">Faturamento (R$)</th>
                          <th className="p-3 text-right">Vendas</th>
                          <th className="p-3 text-right">Investimento Ads (R$)</th>
                          <th className="p-3 text-right">ROAS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...resultado.historico].reverse().map((l) => (
                          <tr key={l.mesChave} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                            <td className="p-3 font-medium">{l.rotulo}</td>
                            <td className="p-3 text-right">{formatarMoeda(l.totalFaturamento)}</td>
                            <td className="p-3 text-right">{l.totalVendas}</td>
                            <td className="p-3 text-right">{formatarMoeda(l.investimentoAds)}</td>
                            <td className="p-3 text-right">{formatarRoas(l.roas)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
