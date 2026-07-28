"use client";

import { useEffect, useState } from "react";
import { formatarData } from "@/lib/date-utils";
import {
  calcularCanaisAutomaticos,
  calcularComissao,
  type ConfigComissao as Config,
  type Nivel,
  type Pesos,
  type Recebedor,
  type ResultadoComissao,
} from "@/lib/sige/comissao";

type MetaMensal = { ano: number; mes: number; valor: number };
type SnapshotResumo = {
  ano: number;
  mes: number;
  resultado: ResultadoComissao;
  calculadoEm: string;
  disparadoPor: "cron" | "manual";
};

const CONFIG_PADRAO: Config = {
  pesos: { organico: 65, pago: 35, amazon: 0 },
  niveis: [
    { nivel: 1, minima: 0, maxima: 80, comissao: 0, ativo: true },
    { nivel: 2, minima: 80.01, maxima: 100, comissao: 0.25, ativo: true },
    { nivel: 3, minima: 100.01, maxima: 110, comissao: 0.35, ativo: true },
    { nivel: 4, minima: 110.01, maxima: 999, comissao: 0.55, ativo: true },
    { nivel: 5, minima: 0, maxima: 0, comissao: 0, ativo: false },
    { nivel: 6, minima: 0, maxima: 0, comissao: 0, ativo: false },
  ],
  recebedores: [
    { nome: "Gestor", ativo: true, percentual: 100 },
    { nome: "Colaborador 2", ativo: false, percentual: 0 },
    { nome: "Colaborador 3", ativo: false, percentual: 0 },
  ],
};

const NOMES_MES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function primeiroDiaMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function ultimoDiaMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}
function numero(v: string): number {
  return Number(v.replace(",", ".")) || 0;
}
function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ComissaoClient({
  configInicial,
  metasMensais,
  snapshotInicial,
}: {
  configInicial: Config | null;
  metasMensais: MetaMensal[];
  snapshotInicial: SnapshotResumo | null;
}) {
  const [aba, setAba] = useState<"calculadora" | "config">("calculadora");
  const [config, setConfig] = useState<Config>(configInicial ?? CONFIG_PADRAO);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [erroConfig, setErroConfig] = useState<string | null>(null);
  const [sucessoConfig, setSucessoConfig] = useState(false);

  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;

  const [snapshot, setSnapshot] = useState<SnapshotResumo | null>(snapshotInicial);
  const [atualizandoSnapshot, setAtualizandoSnapshot] = useState(false);
  const [erroSnapshot, setErroSnapshot] = useState<string | null>(null);

  async function atualizarSnapshot() {
    setAtualizandoSnapshot(true);
    setErroSnapshot(null);
    try {
      const res = await fetch("/api/sige/comissao/atualizar", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setErroSnapshot(data.erro ?? "Falha ao atualizar o resumo automático.");
        return;
      }
      setSnapshot({
        ano: data.ano,
        mes: data.mes,
        resultado: data.resultado,
        calculadoEm: data.calculadoEm,
        disparadoPor: data.disparadoPor,
      });
    } catch {
      setErroSnapshot("Falha ao atualizar o resumo automático.");
    } finally {
      setAtualizandoSnapshot(false);
    }
  }

  // Se nunca foi calculado, ou o snapshot guardado e de um mes anterior
  // (virada de mes sem o cron ainda ter rodado), recalcula automaticamente
  // ao abrir a pagina -- sem exigir clique.
  useEffect(() => {
    if (!snapshot || snapshot.ano !== anoAtual || snapshot.mes !== mesAtual) {
      atualizarSnapshot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mesPassado = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const [periodoDe, setPeriodoDe] = useState(formatarData(primeiroDiaMes(mesPassado)));
  const [periodoAte, setPeriodoAte] = useState(formatarData(ultimoDiaMes(mesPassado)));
  const [metaTotal, setMetaTotal] = useState(() => {
    const m = metasMensais.find(
      (x) => x.ano === mesPassado.getFullYear() && x.mes === mesPassado.getMonth() + 1
    );
    return m ? String(m.valor) : "";
  });
  const [organico, setOrganico] = useState("");
  const [pago, setPago] = useState("");
  const [amazon, setAmazon] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [erroCalc, setErroCalc] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoComissao | null>(null);

  function sugerirMeta(de: string, ate: string) {
    const dDe = new Date(de + "T00:00:00");
    const dAte = new Date(ate + "T00:00:00");
    const eMesExato =
      dDe.getDate() === 1 && dAte.getTime() === ultimoDiaMes(dDe).getTime() && dDe.getMonth() === dAte.getMonth();
    if (!eMesExato) return;
    const m = metasMensais.find((x) => x.ano === dDe.getFullYear() && x.mes === dDe.getMonth() + 1);
    if (m) setMetaTotal(String(m.valor));
  }

  function definirPeriodo(de: Date, ate: Date) {
    const deStr = formatarData(de);
    const ateStr = formatarData(ate);
    setPeriodoDe(deStr);
    setPeriodoAte(ateStr);
    sugerirMeta(deStr, ateStr);
  }

  async function buscarDadosAutomaticos() {
    setBuscando(true);
    setErroCalc(null);
    try {
      const [rVendas, rAds] = await Promise.all([
        fetch(`/api/sige/relatorio?tipo=vendas&de=${periodoDe}&ate=${periodoAte}`),
        fetch(`/api/sige/relatorio?tipo=ads&de=${periodoDe}&ate=${periodoAte}`),
      ]);
      const vendas = await rVendas.json();
      const ads = await rAds.json();
      if (!rVendas.ok || !rAds.ok) {
        setErroCalc(vendas.erro ?? ads.erro ?? "Falha ao buscar dados automáticos.");
        return;
      }
      type ItemVendaResp = { tipo: string; faturamentoLiquido: number; faturamentoBruto: number };
      const itens = (vendas.itens ?? []) as ItemVendaResp[];
      // ML + canais manuais entram pelo faturamento LIQUIDO (bruto -
      // cancelados - devolvidos); Amazon entra pelo faturamento BRUTO puro
      // (sem descontar taxas nem cancelamentos), dividido 50/50 com o
      // organico logo abaixo -- regra provisoria ate a Amazon ganhar meta
      // propria.
      const baseNaoAmazon = itens
        .filter((i) => i.tipo !== "amazon")
        .reduce((s, i) => s + Number(i.faturamentoLiquido ?? 0), 0);
      const amazonBrutoCalc = itens
        .filter((i) => i.tipo === "amazon")
        .reduce((s, i) => s + Number(i.faturamentoBruto ?? 0), 0);
      const adsRetorno = Number(ads.consolidado.retorno ?? 0);

      const { organico: organicoCalc, pago: pagoCalc } = calcularCanaisAutomaticos({
        baseNaoAmazon,
        amazonBruto: amazonBrutoCalc,
        adsRetorno,
      });

      setOrganico(organicoCalc.toFixed(2));
      setPago(pagoCalc.toFixed(2));
      setAmazon(amazonBrutoCalc.toFixed(2));
    } catch {
      setErroCalc("Falha ao buscar dados automáticos.");
    } finally {
      setBuscando(false);
    }
  }

  function calcular() {
    setErroCalc(null);
    const metaTotalNum = numero(metaTotal);
    if (metaTotalNum <= 0) {
      setErroCalc("Informe a meta total (maior que zero).");
      setResultado(null);
      return;
    }
    const organicoNum = numero(organico);
    const pagoNum = numero(pago);
    const amazonNum = numero(amazon); // informativo -- ja deve estar embutido em organico/pago
    setResultado(
      calcularComissao({ metaTotal: metaTotalNum, organico: organicoNum, pago: pagoNum, amazonBruto: amazonNum, config })
    );
  }

  const somaPesos = config.pesos.organico + config.pesos.pago + config.pesos.amazon;

  function atualizarPeso(campo: keyof Pesos, valor: string) {
    setConfig((c) => ({ ...c, pesos: { ...c.pesos, [campo]: numero(valor) } }));
  }

  function atualizarNivel(idx: number, campo: keyof Nivel, valor: string | boolean) {
    setConfig((c) => ({
      ...c,
      niveis: c.niveis.map((n, i) =>
        i === idx
          ? { ...n, [campo]: typeof valor === "boolean" ? valor : campo === "ativo" ? n.ativo : numero(valor) }
          : n
      ),
    }));
  }

  function atualizarRecebedor(idx: number, campo: keyof Recebedor, valor: string | boolean) {
    setConfig((c) => ({
      ...c,
      recebedores: c.recebedores.map((r, i) =>
        i === idx
          ? {
              ...r,
              [campo]: campo === "nome" ? String(valor) : campo === "ativo" ? Boolean(valor) : numero(String(valor)),
            }
          : r
      ),
    }));
  }

  async function salvarConfig() {
    setErroConfig(null);
    setSucessoConfig(false);
    if (Math.abs(somaPesos - 100) > 0.05) {
      setErroConfig(`A soma dos pesos dos canais precisa ser 100% (atual: ${somaPesos.toFixed(1)}%).`);
      return;
    }
    setSalvandoConfig(true);
    try {
      const res = await fetch("/api/sige/comissao/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) {
        setErroConfig(data.erro ?? "Falha ao salvar configuração.");
        return;
      }
      setSucessoConfig(true);
    } catch {
      setErroConfig("Falha ao salvar configuração.");
    } finally {
      setSalvandoConfig(false);
    }
  }

  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #comissao-print, #comissao-print * { visibility: visible; }
          #comissao-print { position: absolute; left: 0; top: 0; width: 100%; padding: 16px; }
          .print-hide { display: none !important; }
        }
      `}</style>

      <div className="mb-6 flex gap-2 print-hide">
        <button
          onClick={() => setAba("calculadora")}
          className={`rounded-full px-3 py-1.5 text-sm ${
            aba === "calculadora"
              ? "bg-[var(--color-sixxis-navy)] text-white"
              : "border border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Calculadora
        </button>
        <button
          onClick={() => setAba("config")}
          className={`rounded-full px-3 py-1.5 text-sm ${
            aba === "config"
              ? "bg-[var(--color-sixxis-navy)] text-white"
              : "border border-gray-300 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Configurações
        </button>
      </div>

      {aba === "config" && (
        <div className="flex flex-col gap-6 print-hide">
          <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Pesos dos canais</h2>
            <p className="mb-4 text-xs text-gray-500">
              Porcentagem da meta total que cada canal representa. A soma precisa ser 100%. Amazon começa zerado
              (será incluído quando a integração de Ads da Amazon estiver pronta).
            </p>
            <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">Orgânico (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.pesos.organico}
                  onChange={(e) => atualizarPeso("organico", e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Pago / Ads (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.pesos.pago}
                  onChange={(e) => atualizarPeso("pago", e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Amazon (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={config.pesos.amazon}
                  onChange={(e) => atualizarPeso("amazon", e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <p className={`text-xs font-medium ${Math.abs(somaPesos - 100) > 0.05 ? "text-red-500" : "text-green-600"}`}>
              Total: {somaPesos.toFixed(1)}%
            </p>
          </div>

          <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Níveis de comissão</h2>
            <p className="mb-4 text-xs text-gray-500">
              4 níveis ativos por padrão. Os níveis 5 e 6 ficam reservados -- ative pela caixa de seleção se quiser
              aumentar o escalonamento no futuro. A comissão de cada nível incide sobre o faturamento inteiro do
              canal (não é progressivo).
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                    <th className="p-2">Nível</th>
                    <th className="p-2">Meta mínima (%)</th>
                    <th className="p-2">Meta máxima (%)</th>
                    <th className="p-2">Comissão (%)</th>
                    <th className="p-2">Ativo</th>
                  </tr>
                </thead>
                <tbody>
                  {config.niveis.map((n, idx) => {
                    const opcional = idx >= 4;
                    const desabilitado = opcional && !n.ativo;
                    return (
                      <tr key={n.nivel} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                        <td className="p-2 font-medium text-gray-700 dark:text-gray-200">Nível {n.nivel}</td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.1"
                            value={n.minima}
                            disabled={desabilitado}
                            onChange={(e) => atualizarNivel(idx, "minima", e.target.value)}
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.1"
                            value={n.maxima}
                            disabled={desabilitado}
                            onChange={(e) => atualizarNivel(idx, "maxima", e.target.value)}
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            step="0.01"
                            value={n.comissao}
                            disabled={desabilitado}
                            onChange={(e) => atualizarNivel(idx, "comissao", e.target.value)}
                            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-100"
                          />
                        </td>
                        <td className="p-2">
                          {opcional ? (
                            <input
                              type="checkbox"
                              checked={n.ativo}
                              onChange={(e) => atualizarNivel(idx, "ativo", e.target.checked)}
                            />
                          ) : (
                            <span className="text-xs text-gray-400">sempre</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
            <h2 className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Quem recebe a comissão</h2>
            <p className="mb-4 text-xs text-gray-500">
              Por enquanto só o Gestor recebe. Os outros 2 recebedores ficam reservados -- ative e defina o % de
              divisão quando quiser incluir mais colaboradores.
            </p>
            <div className="flex flex-col gap-3">
              {config.recebedores.map((r, idx) => {
                const opcional = idx >= 1;
                return (
                  <div key={idx} className="flex flex-wrap items-end gap-3 rounded border border-gray-100 p-3 dark:border-gray-700">
                    {opcional && (
                      <label className="flex items-center gap-2 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={r.ativo}
                          onChange={(e) => atualizarRecebedor(idx, "ativo", e.target.checked)}
                        />
                        Incluir
                      </label>
                    )}
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">Nome</label>
                      <input
                        type="text"
                        value={r.nome}
                        disabled={opcional && !r.ativo}
                        onChange={(e) => atualizarRecebedor(idx, "nome", e.target.value)}
                        className="w-48 rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-500">% da comissão total</label>
                      <input
                        type="number"
                        step="0.1"
                        value={r.percentual}
                        disabled={opcional && !r.ativo}
                        onChange={(e) => atualizarRecebedor(idx, "percentual", e.target.value)}
                        className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {erroConfig && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{erroConfig}</p>}
          {sucessoConfig && (
            <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              Configurações salvas com sucesso.
            </p>
          )}
          <button
            onClick={salvarConfig}
            disabled={salvandoConfig}
            className="self-start rounded bg-[var(--color-sixxis-blue)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {salvandoConfig ? "Salvando..." : "Salvar configurações"}
          </button>
        </div>
      )}

      {aba === "calculadora" && (
        <div className="flex flex-col gap-6">
          <div className="rounded border border-gray-200 bg-white p-4 print-hide dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase text-gray-500">
                  Resumo automático — {NOMES_MES[mesAtual - 1]} {anoAtual} (em andamento)
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Atualiza sozinho todo dia às 23:30
                  {snapshot ? ` · Última atualização: ${formatarDataHora(snapshot.calculadoEm)}` : ""}
                </p>
              </div>
              <button
                onClick={atualizarSnapshot}
                disabled={atualizandoSnapshot}
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300"
              >
                {atualizandoSnapshot ? "Atualizando..." : "Atualizar agora"}
              </button>
            </div>

            {erroSnapshot && (
              <p className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-600">{erroSnapshot}</p>
            )}

            {!snapshot || snapshot.resultado.metaTotal <= 0 ? (
              <p className="text-sm text-gray-400">
                {atualizandoSnapshot
                  ? "Calculando pela primeira vez..."
                  : "Configure a meta deste mês (seção Metas) para habilitar o cálculo automático."}
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded border border-gray-100 p-3 dark:border-gray-700">
                  <p className="text-xs text-gray-400">Meta do mês</p>
                  <p className="text-base font-semibold text-gray-800 dark:text-white">
                    {formatarMoeda(snapshot.resultado.metaTotal)}
                  </p>
                </div>
                <div className="rounded border border-gray-100 p-3 dark:border-gray-700">
                  <p className="text-xs text-gray-400">Faturamento até agora</p>
                  <p className="text-base font-semibold text-gray-800 dark:text-white">
                    {formatarMoeda(snapshot.resultado.faturamentoTotal)}
                  </p>
                </div>
                <div className="rounded border border-gray-100 p-3 dark:border-gray-700">
                  <p className="text-xs text-gray-400">% da meta</p>
                  <p className="text-base font-semibold text-gray-800 dark:text-white">
                    {((snapshot.resultado.faturamentoTotal / snapshot.resultado.metaTotal) * 100).toFixed(1)}%
                  </p>
                </div>
                <div className="rounded border border-green-100 bg-green-50 p-3 dark:border-green-900 dark:bg-green-900/20">
                  <p className="text-xs text-gray-500">Comissão projetada</p>
                  <p className="text-base font-semibold text-green-700 dark:text-green-400">
                    {formatarMoeda(snapshot.resultado.comissaoTotal)}
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="rounded border border-gray-200 bg-white p-4 print-hide dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Período</p>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  const m = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
                  definirPeriodo(primeiroDiaMes(m), ultimoDiaMes(m));
                }}
                className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                Mês passado
              </button>
              <button
                onClick={() => definirPeriodo(primeiroDiaMes(hoje), hoje)}
                className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                Este mês
              </button>
              <input
                type="date"
                value={periodoDe}
                onChange={(e) => {
                  setPeriodoDe(e.target.value);
                  sugerirMeta(e.target.value, periodoAte);
                }}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <span className="text-gray-400">até</span>
              <input
                type="date"
                value={periodoAte}
                onChange={(e) => {
                  setPeriodoAte(e.target.value);
                  sugerirMeta(periodoDe, e.target.value);
                }}
                className="rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
            </div>

            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Meta total (R$)</p>
            <input
              type="text"
              value={metaTotal}
              onChange={(e) => setMetaTotal(e.target.value)}
              placeholder="Ex: 1000000"
              className="mb-4 w-56 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />

            <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
              Faturamento do período (editável -- preenchido pelo botão abaixo)
            </p>
            <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">Orgânico (R$) -- líquido</label>
                <input
                  type="text"
                  value={organico}
                  onChange={(e) => setOrganico(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Pago / Ads (R$)</label>
                <input
                  type="text"
                  value={pago}
                  onChange={(e) => setPago(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  Amazon (R$) -- bruto <span className="text-gray-400">(já dividido 50/50 em Orgânico/Pago)</span>
                </label>
                <input
                  type="text"
                  value={amazon}
                  onChange={(e) => setAmazon(e.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={buscarDadosAutomaticos}
                disabled={buscando}
                className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {buscando ? "Buscando..." : "Buscar dados automáticos (ML + Amazon + Ads)"}
              </button>
              <button
                onClick={calcular}
                className="rounded bg-[var(--color-sixxis-blue)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Calcular comissão
              </button>
            </div>
          </div>

          {erroCalc && <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600 print-hide">{erroCalc}</p>}

          {resultado && (
            <div id="comissao-print">
              <div className="mb-2 hidden print:block">
                <h2 className="text-lg font-bold text-gray-900">SIXXIS · SIGE · Metas &amp; Comissão</h2>
                <p className="text-xs text-gray-500">
                  Período: {periodoDe} a {periodoAte} · Gerado em {new Date().toLocaleString("pt-BR")}
                </p>
              </div>

              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs text-gray-400">
                  Período: {periodoDe} a {periodoAte}
                </p>
                <button
                  onClick={() => window.print()}
                  className="print-hide rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300"
                >
                  Imprimir / Baixar PDF
                </button>
              </div>

              <div className="mb-4 overflow-x-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                      <th className="p-3">Canal</th>
                      <th className="p-3 text-right">Meta (R$)</th>
                      <th className="p-3 text-right">Resultado (R$)</th>
                      <th className="p-3 text-right">% da meta</th>
                      <th className="p-3 text-right">Nível</th>
                      <th className="p-3 text-right">Comissão (R$)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.canais.map((c) => (
                      <tr key={c.nome} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                        <td className="p-3">{c.nome}</td>
                        <td className="p-3 text-right">{formatarMoeda(c.meta)}</td>
                        <td className="p-3 text-right">{formatarMoeda(c.valor)}</td>
                        <td className="p-3 text-right">{c.percentual !== null ? `${c.percentual.toFixed(1)}%` : "—"}</td>
                        <td className="p-3 text-right">
                          {c.nivel ? `Nível ${c.nivel.nivel} (${c.nivel.minima}%–${c.nivel.maxima}%)` : "—"}
                        </td>
                        <td className="p-3 text-right font-medium">{formatarMoeda(c.comissao)}</td>
                      </tr>
                    ))}
                    <tr className="border-b border-gray-100 bg-gray-50/50 text-gray-500 last:border-0 dark:border-gray-700 dark:bg-gray-700/20">
                      <td className="p-3">
                        Amazon <span className="text-xs">(informativo -- já somado 50/50 acima)</span>
                      </td>
                      <td className="p-3 text-right">—</td>
                      <td className="p-3 text-right">{formatarMoeda(resultado.amazonBrutoInformativo)}</td>
                      <td className="p-3 text-right">—</td>
                      <td className="p-3 text-right">—</td>
                      <td className="p-3 text-right">{formatarMoeda(0)}</td>
                    </tr>
                    <tr className="bg-gray-50 font-semibold dark:bg-gray-700/40">
                      <td className="p-3">Total</td>
                      <td className="p-3 text-right">{formatarMoeda(resultado.metaTotal)}</td>
                      <td className="p-3 text-right">{formatarMoeda(resultado.faturamentoTotal)}</td>
                      <td className="p-3 text-right">—</td>
                      <td className="p-3 text-right">—</td>
                      <td className="p-3 text-right">{formatarMoeda(resultado.comissaoTotal)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Resumo</p>
                  <div className="flex items-center justify-between py-1 text-sm">
                    <span className="text-gray-500">Faturamento total</span>
                    <span className="font-medium text-gray-800 dark:text-white">
                      {formatarMoeda(resultado.faturamentoTotal)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1 text-sm">
                    <span className="text-gray-500">Meta total</span>
                    <span className="font-medium text-gray-800 dark:text-white">{formatarMoeda(resultado.metaTotal)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-base dark:border-gray-700">
                    <span className="font-semibold text-gray-700 dark:text-gray-200">Comissão final total</span>
                    <span className="font-bold text-green-600">{formatarMoeda(resultado.comissaoTotal)}</span>
                  </div>
                </div>

                <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Comissão por responsável</p>
                  {resultado.recebedoresAtivos.length === 0 ? (
                    <p className="text-sm text-gray-400">Nenhum recebedor ativo na configuração.</p>
                  ) : (
                    resultado.recebedoresAtivos.map((r) => (
                      <div key={r.nome} className="flex items-center justify-between py-1 text-sm">
                        <span className="text-gray-600 dark:text-gray-300">
                          {r.nome} <span className="text-xs text-gray-400">({r.percentual}%)</span>
                        </span>
                        <span className="font-medium text-gray-800 dark:text-white">{formatarMoeda(r.valor)}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
