"use client";

// Componente de apresentacao (client component, por causa do filtro de
// pilula e do clique-detalhe interativos) da secao "Metricas" de Vendas --
// horario de compra (dia da semana x hora, no estilo do proprio painel do
// Mercado Livre mas em barras em vez de bolinhas), vendas por estado e mais
// vendidos por SKU. Reaproveitado tanto no Resumo de Vendas
// (/dashboard/vendas) quanto na subpagina dedicada (/dashboard/vendas/metricas).
//
// 30/07/2026: o card de "Horario de compra" foi redesenhado a pedido do
// usuario -- antes era so um grafico de barras por hora (0h-23h, agregado
// de todo o periodo, sem quebra por dia da semana nem por conta). Agora
// reproduz a mesma logica do card "Concentracao de vendas por dia e
// horario" do proprio Mercado Livre (7 linhas, uma por dia da semana, cada
// uma com 24 horarios), mas com um grafico de barras simples em vez do
// grafico de bolinhas do ML (que o usuario achou confuso). O filtro de
// conta usa o mesmo padrao de "pilula" (rounded-full) ja usado nos presets
// de periodo do restante do painel.
//
// 30/07/2026 (v2): grade de horas fixa embaixo do grafico, barras mais
// altas/visiveis, cores por conta (consolidado = roxo #9D00FF, conta
// filtrada = cor da propria conta) e clique numa celula dia x hora abrindo
// um painel com o detalhe (quais contas venderam, quais produtos/SKUs).
//
// 30/07/2026 (v3): reordenado a pedido do usuario -- logo abaixo do
// grafico de horario vem a participacao por SKU no faturamento (estatico,
// sem filtro proprio), depois a Curva ABC de horarios (agora tambem
// recolhivel, mesmo padrao de botao "Recolher/Expandir" do detalhamento
// por estado/SKU), e por ultimo o detalhamento por estado e SKU.

import { useEffect, useMemo, useRef, useState } from "react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { ESTADOS_BRASIL, BRASIL_MAPA_VIEWBOX } from "@/lib/brazil-map-paths";

export type ItemPedidoView = { sku: string | null; titulo: string; quantidade: number };
export type PedidoHorarioView = { contaId: string; dataCriacao: string; itens: ItemPedidoView[] };
export type ContaFiltroView = { id: string; nome: string; cor: string };
export type PontoEstadoView = { estado: string; quantidade: number };
export type RankingSkuView = { sku: string; quantidade: number; valor?: number };
// Fase 10 (30/07/2026): detalhamento por estado para o mapa do Brasil --
// pedidos, clientes distintos, valor e o top-10 de SKU vendidos direto
// naquele estado, tudo ja agregado no servidor (ver vendas/page.tsx e
// vendas/metricas/page.tsx) a partir de dados ja buscados (zero chamada
// nova ao Mercado Livre).
export type SkuEstadoView = { sku: string; titulo: string; quantidade: number; valor: number };
export type EstadoVendaDetalheView = {
  estado: string; // nome como o Mercado Livre devolve (ex: "São Paulo")
  pedidos: number;
  clientes: number;
  valor: number;
  porSku: SkuEstadoView[];
};

const COR_CONSOLIDADO = "#9D00FF";
const COR_PADRAO_FALLBACK = "#64748b";

// Paleta exclusiva para o grafico de participacao por SKU -- deliberadamente
// diferente da paleta de cores de conta (PALETA_CORES_CONTA em
// account-colors.ts), para nunca ser confundida com a cor de uma conta em
// outro grafico do painel.
const PALETA_SKU = [
  "#0d9488", // teal-600
  "#0369a1", // sky-700
  "#7c3aed", // violet-600
  "#be123c", // rose-700
  "#a16207", // amber-700
  "#4d7c0f", // lime-700
  "#1e40af", // blue-800
  "#701a75", // fuchsia-800
  "#155e75", // cyan-800
];
const COR_OUTROS_SKU = "#94a3b8"; // slate-400, para o agrupamento "Outros"

const formatarMoedaBRL = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

// --- Curva ABC de horarios (Pareto) ---

type ClasseAbc = "A" | "B" | "C";
type PontoAbc = { hora: number; quantidade: number; pctIndividual: number; pctAcumulado: number; classe: ClasseAbc };

const COR_CLASSE_ABC: Record<ClasseAbc, string> = {
  A: "#15803d", // green-700 -- horas que mais concentram vendas
  B: "#b45309", // amber-700
  C: "#94a3b8", // slate-400
};

// Classificacao ABC classica (Pareto): ordena as horas do dia (0-23,
// somando todos os dias do periodo/filtro) da mais vendida para a menos
// vendida, calcula o percentual acumulado e classifica em A (ate 80% das
// vendas), B (ate 95%) e C (o resto) -- mesma logica de curva ABC usada em
// analise de estoque/SKU, aplicada aqui ao horario de compra.
function classificarAbc(totalPorHora: number[]): PontoAbc[] {
  const total = totalPorHora.reduce((s, q) => s + q, 0);
  if (total === 0) return [];
  const ordenado = totalPorHora
    .map((quantidade, hora) => ({ hora, quantidade }))
    .filter((p) => p.quantidade > 0)
    .sort((a, b) => b.quantidade - a.quantidade);

  let acumulado = 0;
  return ordenado.map((item) => {
    acumulado += item.quantidade;
    const pctAcumulado = (acumulado / total) * 100;
    const classe: ClasseAbc = pctAcumulado <= 80 ? "A" : pctAcumulado <= 95 ? "B" : "C";
    return { ...item, pctIndividual: (item.quantidade / total) * 100, pctAcumulado, classe };
  });
}

const DIAS_SEMANA = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];
const DIAS_SEMANA_CURTO = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// dataCriacao vem da API do ML com o offset do vendedor ja embutido
// (geralmente -03:00, ver periodoDeDatas em orders.ts). Extraimos
// ano/mes/dia/hora direto da string (em vez de usar Date.getDay()/
// getHours(), que converteriam para o fuso do servidor -- UTC na Vercel --
// e dariam o dia/hora errados). O dia da semana e calculado com Date.UTC
// usando esses mesmos componentes, o que evita qualquer conversao de fuso.
function diaHoraBrasilia(iso: string): { dia: number; hora: number } {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):/);
  if (!m) {
    const d = new Date(iso);
    return { dia: d.getUTCDay(), hora: d.getUTCHours() };
  }
  const [, ano, mes, diaMes, hora] = m;
  const dia = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(diaMes))).getUTCDay();
  return { dia, hora: Number(hora) };
}

function construirMatriz(pedidos: PedidoHorarioView[]): number[][] {
  const matriz: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const p of pedidos) {
    const { dia, hora } = diaHoraBrasilia(p.dataCriacao);
    matriz[dia][hora]++;
  }
  return matriz;
}

function calcularStats(matriz: number[][]) {
  const totalPorDia = new Array(7).fill(0);
  const totalPorHora = new Array(24).fill(0);
  let total = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const q = matriz[d][h];
      total += q;
      totalPorDia[d] += q;
      totalPorHora[h] += q;
    }
  }
  let diaPico = 0;
  let diaPicoTotal = -1;
  for (let d = 0; d < 7; d++) {
    if (totalPorDia[d] > diaPicoTotal) {
      diaPicoTotal = totalPorDia[d];
      diaPico = d;
    }
  }
  let horaPico = 0;
  let horaPicoTotal = -1;
  for (let h = 0; h < 24; h++) {
    if (totalPorHora[h] > horaPicoTotal) {
      horaPicoTotal = totalPorHora[h];
      horaPico = h;
    }
  }
  const maxCelula = Math.max(...matriz.flat(), 1);
  return { total, diaPico, diaPicoTotal, horaPico, horaPicoTotal, maxCelula };
}

const ALTURA_LINHA = 44; // px -- barras mais altas/visiveis (era 28px na v1)

// --- Mapa de vendas por estado (Fase 10) ---

// Remove acentos e normaliza caixa para casar o nome do estado que vem do
// Mercado Livre (receiver_address.state.name) com o nome usado no dataset
// de contornos (brazil-map-paths.ts) -- ambos devem bater exatamente na
// pratica, mas essa normalizacao protege contra pequenas divergencias de
// grafia/acentuacao entre as duas fontes.
const REGEX_DIACRITICOS = new RegExp(String.fromCharCode(91, 92, 117, 48, 51, 48, 48, 45, 92, 117, 48, 51, 54, 102, 93), "g");
function normalizarNomeEstado(s: string): string {
  return s
    .normalize("NFD")
    .replace(REGEX_DIACRITICOS, "")
    .toLowerCase()
    .trim();
}

// Duas escalas de verde (clara/escura) -- interpolacao linear em RGB entre
// um tom baixo (poucas vendas) e um tom alto (muitas vendas). No modo claro
// vai de um verde bem claro ate um verde grama escuro; no modo escuro vai
// de um verde escuro discreto (nao "estoura" contra o fundo) ate um verde
// vivo/claro, para continuar legivel nos dois temas.
const VERDE_CLARO = { min: [234, 250, 224], max: [21, 87, 36] } as const; // #eafae0 -> #155724
const VERDE_ESCURO = { min: [31, 61, 36], max: [134, 239, 172] } as const; // #1f3d24 -> #86efac
const CINZA_SEM_DADOS = { claro: "#e5e7eb", escuro: "#374151" };

function corEstado(t: number, escuro: boolean): string {
  const esc = escuro ? VERDE_ESCURO : VERDE_CLARO;
  const [r0, g0, b0] = esc.min;
  const [r1, g1, b1] = esc.max;
  const r = Math.round(r0 + (r1 - r0) * t);
  const g = Math.round(g0 + (g1 - g0) * t);
  const b = Math.round(b0 + (b1 - b0) * t);
  return `rgb(${r},${g},${b})`;
}

export default function MetricasVendasView({
  pedidosHorario,
  contas,
  vendasPorEstado,
  estadoAmostraParcial,
  estadoResolvidoTotal,
  estadoTotalPeriodo,
  maisVendidosPorSku,
  porEstadoDetalhado,
}: {
  pedidosHorario: PedidoHorarioView[];
  contas: ContaFiltroView[];
  vendasPorEstado: PontoEstadoView[];
  estadoAmostraParcial: boolean;
  estadoResolvidoTotal: number;
  estadoTotalPeriodo: number;
  maisVendidosPorSku: RankingSkuView[];
  porEstadoDetalhado: EstadoVendaDetalheView[];
}) {
  const [contaSelecionada, setContaSelecionada] = useState<string>("todas");
  const [celulaSelecionada, setCelulaSelecionada] = useState<{ dia: number; hora: number } | null>(null);

  const corAtual =
    contaSelecionada === "todas"
      ? COR_CONSOLIDADO
      : contas.find((c) => c.id === contaSelecionada)?.cor ?? COR_CONSOLIDADO;

  const pedidosFiltrados = useMemo(
    () =>
      contaSelecionada === "todas"
        ? pedidosHorario
        : pedidosHorario.filter((p) => p.contaId === contaSelecionada),
    [pedidosHorario, contaSelecionada]
  );

  const matriz = useMemo(() => construirMatriz(pedidosFiltrados), [pedidosFiltrados]);
  const stats = useMemo(() => calcularStats(matriz), [matriz]);

  // Curva ABC de horarios: reaproveita a mesma matriz (ja respeita o filtro
  // de pilula por conta) somando os 7 dias para cada hora -- zero dado novo,
  // so uma leitura diferente do mesmo grafico acima.
  const totalPorHora = useMemo(() => {
    const arr = new Array(24).fill(0);
    for (let h = 0; h < 24; h++) for (let d = 0; d < 7; d++) arr[h] += matriz[d][h];
    return arr;
  }, [matriz]);
  const curvaAbc = useMemo(() => classificarAbc(totalPorHora), [totalPorHora]);
  const resumoAbc = useMemo(() => {
    const grupos: Record<ClasseAbc, { horas: number; quantidade: number }> = {
      A: { horas: 0, quantidade: 0 },
      B: { horas: 0, quantidade: 0 },
      C: { horas: 0, quantidade: 0 },
    };
    for (const p of curvaAbc) {
      grupos[p.classe].horas++;
      grupos[p.classe].quantidade += p.quantidade;
    }
    return grupos;
  }, [curvaAbc]);

  // Participacao por SKU no faturamento: mesmo ranking ja usado no card
  // "Mais vendidos por SKU" (maisVendidosPorSku), so que ordenado por valor
  // em vez de quantidade -- agrupa o restante (alem dos 8 maiores) em
  // "Outros" para o grafico de pizza nao ficar ilegivel com dezenas de fatias.
  // Estatico (nao usa o filtro de pilula por conta acima -- sempre mostra o
  // consolidado do periodo, a pedido do usuario).
  const dadosPizzaSku = useMemo(() => {
    const comValor = maisVendidosPorSku.filter((s) => (s.valor ?? 0) > 0);
    if (comValor.length === 0) return [];
    const ordenado = [...comValor].sort((a, b) => (b.valor ?? 0) - (a.valor ?? 0));
    const top = ordenado.slice(0, 8);
    const restante = ordenado.slice(8).reduce((s, r) => s + (r.valor ?? 0), 0);
    const fatias = top.map((r, i) => ({ sku: r.sku, valor: r.valor ?? 0, cor: PALETA_SKU[i % PALETA_SKU.length] }));
    if (restante > 0) fatias.push({ sku: "Outros", valor: restante, cor: COR_OUTROS_SKU });
    return fatias;
  }, [maisVendidosPorSku]);
  const totalPizzaSku = dadosPizzaSku.reduce((s, f) => s + f.valor, 0);

  const [abcAberto, setAbcAberto] = useState(true);
  const [detalheAberto, setDetalheAberto] = useState(true);

  // --- Mapa de vendas por estado (Fase 10) ---
  // Deteccao de modo escuro: o painel alterna a classe "dark" na <html> (ver
  // toggle em Configuracoes), entao observamos essa classe diretamente em
  // vez de so ler prefers-color-scheme uma vez -- assim o mapa reage na
  // hora se o usuario trocar de tema sem recarregar a pagina.
  const [modoEscuro, setModoEscuro] = useState(false);
  useEffect(() => {
    const atualizar = () => setModoEscuro(document.documentElement.classList.contains("dark"));
    atualizar();
    const obs = new MutationObserver(atualizar);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const mapaRef = useRef<HTMLDivElement>(null);
  const [hoverEstado, setHoverEstado] = useState<{ nome: string; x: number; y: number } | null>(null);
  const [estadoSelecionado, setEstadoSelecionado] = useState<string | null>(null);

  const detalhePorEstadoNormalizado = useMemo(() => {
    const mapa = new Map<string, EstadoVendaDetalheView>();
    for (const e of porEstadoDetalhado) mapa.set(normalizarNomeEstado(e.estado), e);
    return mapa;
  }, [porEstadoDetalhado]);

  const maxValorEstado = useMemo(
    () => Math.max(...porEstadoDetalhado.map((e) => e.valor), 1),
    [porEstadoDetalhado]
  );

  const detalheCelula = useMemo(() => {
    if (!celulaSelecionada) return null;
    const pedidosCelula = pedidosFiltrados.filter((p) => {
      const { dia, hora } = diaHoraBrasilia(p.dataCriacao);
      return dia === celulaSelecionada.dia && hora === celulaSelecionada.hora;
    });

    const porConta = new Map<string, number>();
    const porProduto = new Map<string, { label: string; quantidade: number }>();
    for (const p of pedidosCelula) {
      porConta.set(p.contaId, (porConta.get(p.contaId) ?? 0) + 1);
      for (const item of p.itens) {
        const chave = item.sku ?? `titulo:${item.titulo}`;
        const label = item.sku ? `${item.sku} — ${item.titulo}` : item.titulo;
        const atual = porProduto.get(chave);
        if (atual) atual.quantidade += item.quantidade;
        else porProduto.set(chave, { label, quantidade: item.quantidade });
      }
    }

    return {
      total: pedidosCelula.length,
      porConta: Array.from(porConta.entries())
        .map(([contaId, quantidade]) => {
          const conta = contas.find((c) => c.id === contaId);
          return { contaId, nome: conta?.nome ?? "Conta", cor: conta?.cor ?? COR_PADRAO_FALLBACK, quantidade };
        })
        .sort((a, b) => b.quantidade - a.quantidade),
      porProduto: Array.from(porProduto.values()).sort((a, b) => b.quantidade - a.quantidade),
    };
  }, [celulaSelecionada, pedidosFiltrados, contas]);

  const pillBase = "rounded-full px-3 py-1.5 text-xs font-medium transition-colors";
  const pillInativa =
    "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800";

  function alternarCelula(dia: number, hora: number) {
    setCelulaSelecionada((atual) => (atual && atual.dia === dia && atual.hora === hora ? null : { dia, hora }));
  }

  return (
    <div className="space-y-4">
      <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Concentração de vendas por dia e horário
          </p>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setContaSelecionada("todas");
                setCelulaSelecionada(null);
              }}
              className={`${pillBase} ${contaSelecionada === "todas" ? "text-white" : pillInativa}`}
              style={contaSelecionada === "todas" ? { backgroundColor: COR_CONSOLIDADO } : undefined}
            >
              Consolidado
            </button>
            {contas.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  setContaSelecionada(c.id);
                  setCelulaSelecionada(null);
                }}
                className={`${pillBase} ${contaSelecionada === c.id ? "text-white" : pillInativa}`}
                style={contaSelecionada === c.id ? { backgroundColor: c.cor } : undefined}
              >
                <span
                  className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                  style={{ backgroundColor: c.cor }}
                />
                {c.nome}
              </button>
            ))}
          </div>
        </div>

        {stats.total === 0 ? (
          <p className="text-sm text-gray-400">Sem dados suficientes no período.</p>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex-1 space-y-1">
              {matriz.map((horas, d) => {
                const totalDia = horas.reduce((s, q) => s + q, 0);
                return (
                  <div key={d} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      {DIAS_SEMANA_CURTO[d]}
                    </span>
                    <div className="flex flex-1 items-end gap-px" style={{ height: ALTURA_LINHA }}>
                      {horas.map((q, h) => {
                        const selecionada = celulaSelecionada?.dia === d && celulaSelecionada?.hora === h;
                        return (
                          <button
                            key={h}
                            type="button"
                            title={`${DIAS_SEMANA[d]}, ${h}h: ${q} pedido(s)`}
                            onClick={() => q > 0 && alternarCelula(d, h)}
                            className="flex-1 rounded-[1px] transition-[filter]"
                            style={{
                              height: `${q > 0 ? Math.max((q / stats.maxCelula) * 100, 18) : 3}%`,
                              backgroundColor: corAtual,
                              opacity: q > 0 ? 0.85 : 0.25,
                              outline: selecionada ? `2px solid ${corAtual}` : "none",
                              outlineOffset: 1,
                              cursor: q > 0 ? "pointer" : "default",
                            }}
                          />
                        );
                      })}
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                      {totalDia}
                    </span>
                  </div>
                );
              })}

              {/* Grade de horas fixa (0h a 23h), alinhada com as colunas das barras acima */}
              <div className="flex items-center gap-2 pt-0.5">
                <span className="w-20 shrink-0" />
                <div className="flex flex-1 gap-px">
                  {Array.from({ length: 24 }).map((_, h) => (
                    <span
                      key={h}
                      className="flex-1 text-center text-[8px] leading-none text-gray-400 dark:text-gray-500"
                    >
                      {h}
                    </span>
                  ))}
                </div>
                <span className="w-8 shrink-0" />
              </div>
              <p className="pl-[88px] text-xs text-gray-400">Fuso de Brasília · clique numa barra para ver o detalhe</p>

              {detalheCelula && (
                <div className="mt-2 rounded border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">
                      {celulaSelecionada && DIAS_SEMANA[celulaSelecionada.dia]}, {celulaSelecionada?.hora}h ·{" "}
                      {detalheCelula.total} pedido(s)
                    </p>
                    <button
                      type="button"
                      onClick={() => setCelulaSelecionada(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      Fechar ×
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs uppercase text-gray-400">Por conta</p>
                      <ul className="space-y-1">
                        {detalheCelula.porConta.map((c) => (
                          <li key={c.contaId} className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 truncate text-gray-600 dark:text-gray-300">
                              <span
                                className="inline-block h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: c.cor }}
                              />
                              {c.nome}
                            </span>
                            <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">
                              {c.quantidade}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="mb-1 text-xs uppercase text-gray-400">Produtos vendidos</p>
                      {detalheCelula.porProduto.length === 0 ? (
                        <p className="text-xs text-gray-400">—</p>
                      ) : (
                        <ul className="space-y-1">
                          {detalheCelula.porProduto.slice(0, 6).map((p) => (
                            <li key={p.label} className="flex justify-between gap-2">
                              <span className="truncate text-gray-600 dark:text-gray-300">{p.label}</span>
                              <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">
                                {p.quantidade}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex shrink-0 flex-row gap-4 border-gray-100 pt-2 dark:border-gray-700 lg:w-44 lg:flex-col lg:border-l lg:pl-4 lg:pt-0">
              <div>
                <p className="text-xs text-gray-400">Pedidos no filtro</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.total}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Dia com mais vendas</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {DIAS_SEMANA[stats.diaPico]}
                </p>
                <p className="text-xs text-gray-400">{stats.diaPicoTotal} pedido(s)</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Horário de pico (pico de compras)</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{stats.horaPico}h</p>
                <p className="text-xs text-gray-400">{stats.horaPicoTotal} pedido(s) nesse horário</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Participacao por SKU no faturamento -- mesmo padrao do grafico "por
      conta" do Resumo. Estatico (sem filtro proprio), logo abaixo do
      grafico de horario a pedido do usuario. */}
      {dadosPizzaSku.length > 0 && (
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="mb-4 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Participação por SKU no faturamento
          </p>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <ResponsiveContainer width="100%" height={220} className="sm:max-w-[220px]">
              <PieChart>
                <Pie data={dadosPizzaSku} dataKey="valor" nameKey="sku" innerRadius={50} outerRadius={90} paddingAngle={2}>
                  {dadosPizzaSku.map((f) => (
                    <Cell key={f.sku} fill={f.cor} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatarMoedaBRL(Number(value) || 0)} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="flex flex-1 flex-col gap-2">
              {dadosPizzaSku.map((f) => {
                const pct = totalPizzaSku > 0 ? (f.valor / totalPizzaSku) * 100 : 0;
                return (
                  <li key={f.sku} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: f.cor }} />
                      <span className="truncate text-gray-700 dark:text-gray-300">{f.sku}</span>
                    </span>
                    <span className="shrink-0 text-gray-600 dark:text-gray-400">
                      {formatarMoedaBRL(f.valor)} · {pct.toFixed(1)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* Curva ABC de horarios (Pareto) -- reaproveita o mesmo filtro de conta
      acima. Recolhivel (mesmo padrao de botao do detalhamento por estado/SKU
      abaixo), a pedido do usuario. */}
      <div className="rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <button
          type="button"
          onClick={() => setAbcAberto((v) => !v)}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Curva ABC de horários</span>
          <span className="text-xs text-gray-400">{abcAberto ? "Recolher ▴" : "Expandir ▾"}</span>
        </button>
        {abcAberto && (
          <div className="border-t border-gray-100 p-4 dark:border-gray-700">
            <p className="mb-3 text-xs text-gray-400">
              Horas do dia ordenadas pelo volume de vendas (todos os dias somados) — classe A concentra até 80% das
              vendas, B até 95%, C o restante.
            </p>
            {curvaAbc.length === 0 ? (
              <p className="text-sm text-gray-400">Sem dados suficientes no período.</p>
            ) : (
              <>
                <div className="mb-3 grid grid-cols-3 gap-3">
                  {(["A", "B", "C"] as ClasseAbc[]).map((classe) => (
                    <div key={classe} className="rounded border border-gray-100 p-2 dark:border-gray-700">
                      <span
                        className="mb-1 inline-block rounded px-1.5 py-0.5 text-xs font-bold text-white"
                        style={{ backgroundColor: COR_CLASSE_ABC[classe] }}
                      >
                        Classe {classe}
                      </span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {resumoAbc[classe].horas} hora(s) · {resumoAbc[classe].quantidade} pedido(s)
                      </p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  {curvaAbc.map((p) => (
                    <div key={p.hora} className="flex items-center gap-2">
                      <span className="w-10 shrink-0 text-xs text-gray-500 dark:text-gray-400">{p.hora}h</span>
                      <div className="h-3.5 flex-1 overflow-hidden rounded-sm bg-gray-100 dark:bg-gray-700">
                        <div
                          className="h-full rounded-sm"
                          style={{ width: `${p.pctIndividual}%`, backgroundColor: COR_CLASSE_ABC[p.classe] }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                        {p.quantidade}
                      </span>
                      <span className="w-12 shrink-0 text-right text-[10px] text-gray-400">
                        {p.pctAcumulado.toFixed(0)}% ac.
                      </span>
                      <span
                        className="w-5 shrink-0 rounded text-center text-[10px] font-bold text-white"
                        style={{ backgroundColor: COR_CLASSE_ABC[p.classe] }}
                      >
                        {p.classe}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Mapa de vendas por estado (Fase 10) -- verde claro/escuro conforme o
      tema, hover mostra clientes/pedidos/valor, clique abre o detalhamento
      por SKU daquele estado. Usa o mesmo cache de estado do card "Vendas
      por estado" abaixo, so que com a agregacao completa (valor, clientes
      distintos, SKU) feita no servidor a partir de dados ja buscados. */}
      {porEstadoDetalhado.length > 0 && (
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-300">Mapa de vendas por estado</p>
          <p className="mb-3 text-xs text-gray-400">
            Passe o mouse para ver clientes, pedidos e valor · clique num estado para ver o detalhamento por SKU.
          </p>
          <div ref={mapaRef} className="relative mx-auto max-w-[280px]">
            <svg
              viewBox={`0 0 ${BRASIL_MAPA_VIEWBOX.w} ${BRASIL_MAPA_VIEWBOX.h}`}
              className="w-full"
              onMouseLeave={() => setHoverEstado(null)}
            >
              {ESTADOS_BRASIL.map((est) => {
                const chave = normalizarNomeEstado(est.nome);
                const detalhe = detalhePorEstadoNormalizado.get(chave) ?? null;
                const temDados = !!detalhe && detalhe.valor > 0;
                const t = temDados ? Math.sqrt(detalhe!.valor / maxValorEstado) : 0;
                const preenchimento = temDados
                  ? corEstado(t, modoEscuro)
                  : modoEscuro
                    ? CINZA_SEM_DADOS.escuro
                    : CINZA_SEM_DADOS.claro;
                const selecionado = estadoSelecionado === chave;
                return (
                  <path
                    key={est.sigla}
                    d={est.d}
                    fill={preenchimento}
                    stroke={selecionado ? (modoEscuro ? "#ffffff" : "#111827") : modoEscuro ? "#1f2937" : "#ffffff"}
                    strokeWidth={selecionado ? 2.5 : 1}
                    style={{ cursor: temDados ? "pointer" : "default", transition: "fill 0.15s" }}
                    onMouseMove={(e) => {
                      if (!temDados) return;
                      const rect = mapaRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      setHoverEstado({ nome: est.nome, x: e.clientX - rect.left, y: e.clientY - rect.top });
                    }}
                    onMouseLeave={() => setHoverEstado(null)}
                    onClick={() => temDados && setEstadoSelecionado((atual) => (atual === chave ? null : chave))}
                  />
                );
              })}
            </svg>
            {hoverEstado &&
              (() => {
                const detalhe = detalhePorEstadoNormalizado.get(normalizarNomeEstado(hoverEstado.nome));
                if (!detalhe) return null;
                return (
                  <div
                    className="pointer-events-none absolute z-10 whitespace-nowrap rounded bg-gray-900 px-2 py-1.5 text-xs text-white shadow-lg dark:bg-gray-100 dark:text-gray-900"
                    style={{ left: hoverEstado.x + 10, top: hoverEstado.y + 10 }}
                  >
                    <p className="font-semibold">{hoverEstado.nome}</p>
                    <p>
                      {detalhe.clientes} cliente(s) · {detalhe.pedidos} pedido(s)
                    </p>
                    <p>{formatarMoedaBRL(detalhe.valor)}</p>
                  </div>
                );
              })()}
          </div>

          <div className="mx-auto mt-3 flex max-w-[280px] items-center gap-2 text-[10px] text-gray-400">
            <span>Menos vendas</span>
            <div
              className="h-2 flex-1 rounded-full"
              style={{ background: `linear-gradient(to right, ${corEstado(0, modoEscuro)}, ${corEstado(1, modoEscuro)})` }}
            />
            <span>Mais vendas</span>
          </div>

          {estadoSelecionado &&
            (() => {
              const est = ESTADOS_BRASIL.find((e) => normalizarNomeEstado(e.nome) === estadoSelecionado);
              const detalhe = est ? detalhePorEstadoNormalizado.get(normalizarNomeEstado(est.nome)) : null;
              if (!est || !detalhe) return null;
              return (
                <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">
                      {est.nome} · {detalhe.pedidos} pedido(s) · {formatarMoedaBRL(detalhe.valor)}
                    </p>
                    <button
                      type="button"
                      onClick={() => setEstadoSelecionado(null)}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                    >
                      Fechar ×
                    </button>
                  </div>
                  <p className="mb-1 text-xs uppercase text-gray-400">Vendas diretas por SKU</p>
                  {detalhe.porSku.length === 0 ? (
                    <p className="text-xs text-gray-400">Sem detalhamento de SKU para este estado.</p>
                  ) : (
                    <ul className="space-y-1">
                      {detalhe.porSku.map((s) => (
                        <li key={s.sku} className="flex justify-between gap-2">
                          <span className="truncate text-gray-600 dark:text-gray-300">
                            {s.sku} <span className="text-gray-400">×{s.quantidade}</span>
                          </span>
                          <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">
                            {formatarMoedaBRL(s.valor)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}
        </div>
      )}

      {/* Vendas por estado + Mais vendidos por SKU -- recolhivel para nao ocupar
      espaco fixo na pagina quando o usuario ja tiver visto o detalhe */}
      <div className="rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <button
          type="button"
          onClick={() => setDetalheAberto((v) => !v)}
          className="flex w-full items-center justify-between p-4 text-left"
        >
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Detalhamento por estado e SKU
          </span>
          <span className="text-xs text-gray-400">{detalheAberto ? "Recolher ▴" : "Expandir ▾"}</span>
        </button>
        {detalheAberto && (
          <div className="grid grid-cols-1 gap-4 border-t border-gray-100 p-4 dark:border-gray-700 sm:grid-cols-2">
            <div>
              <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Vendas por estado</p>
              {vendasPorEstado.length === 0 ? (
                <p className="text-sm text-gray-400">Sem dados suficientes no período.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {vendasPorEstado.map((e) => (
                    <li key={e.estado} className="flex justify-between gap-2">
                      <span className="truncate text-gray-600 dark:text-gray-300">{e.estado}</span>
                      <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">{e.quantidade}</span>
                    </li>
                  ))}
                </ul>
              )}
              {estadoTotalPeriodo > 0 && (
                <p className="mt-2 text-xs text-gray-400">
                  Endereço resolvido para {estadoResolvidoTotal} de {estadoTotalPeriodo} pedidos do período.
                </p>
              )}
              {estadoAmostraParcial && (
                <p className="mt-1 text-xs text-amber-600">
                  Os demais serão resolvidos automaticamente nas próximas visitas a esta página.
                </p>
              )}
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Mais vendidos por SKU</p>
              {maisVendidosPorSku.length === 0 ? (
                <p className="text-sm text-gray-400">Sem dados suficientes no período.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {maisVendidosPorSku.slice(0, 8).map((s) => (
                    <li key={s.sku} className="flex justify-between gap-2">
                      <span className="truncate text-gray-600 dark:text-gray-300">{s.sku}</span>
                      <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">{s.quantidade} un.</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
