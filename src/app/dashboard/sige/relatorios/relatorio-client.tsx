"use client";

import { useState } from "react";
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

type ResultadoVendas = {
  tipo: "vendas";
  periodo: { de: string; ate: string };
  consolidado: Omit<ItemVendasRel, "id" | "tipo" | "nome" | "cor" | "erro">;
  itens: ItemVendasRel[];
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

const TIPOS_RELATORIO: { key: string; label: string; disponivel: boolean }[] = [
  { key: "vendas", label: "Vendas", disponivel: true },
  { key: "ads", label: "Publicidade / Investimento / Retorno", disponivel: true },
  { key: "crescimento", label: "Crescimento", disponivel: true },
  { key: "visitas", label: "Visitas", disponivel: false },
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
