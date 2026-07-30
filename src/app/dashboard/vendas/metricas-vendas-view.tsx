"use client";

// Componente de apresentacao (client component, por causa do filtro de
// pilula interativo) da secao "Metricas" de Vendas -- horario de compra
// (dia da semana x hora, no estilo do proprio painel do Mercado Livre mas
// em barras em vez de bolinhas), vendas por estado e mais vendidos por SKU.
// Reaproveitado tanto no Resumo de Vendas (/dashboard/vendas) quanto na
// subpagina dedicada (/dashboard/vendas/metricas).
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

import { useMemo, useState } from "react";

export type PedidoHorarioView = { contaId: string; dataCriacao: string };
export type ContaFiltroView = { id: string; nome: string; cor: string };
export type PontoEstadoView = { estado: string; quantidade: number };
export type RankingSkuView = { sku: string; quantidade: number };

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

export default function MetricasVendasView({
  pedidosHorario,
  contas,
  vendasPorEstado,
  estadoAmostraParcial,
  estadoResolvidoTotal,
  estadoTotalPeriodo,
  maisVendidosPorSku,
}: {
  pedidosHorario: PedidoHorarioView[];
  contas: ContaFiltroView[];
  vendasPorEstado: PontoEstadoView[];
  estadoAmostraParcial: boolean;
  estadoResolvidoTotal: number;
  estadoTotalPeriodo: number;
  maisVendidosPorSku: RankingSkuView[];
}) {
  const [contaSelecionada, setContaSelecionada] = useState<string>("todas");

  const pedidosFiltrados = useMemo(
    () =>
      contaSelecionada === "todas"
        ? pedidosHorario
        : pedidosHorario.filter((p) => p.contaId === contaSelecionada),
    [pedidosHorario, contaSelecionada]
  );

  const matriz = useMemo(() => construirMatriz(pedidosFiltrados), [pedidosFiltrados]);
  const stats = useMemo(() => calcularStats(matriz), [matriz]);

  const pillBase = "rounded-full px-3 py-1.5 text-xs font-medium transition-colors";
  const pillInativa =
    "border border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800";

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
              onClick={() => setContaSelecionada("todas")}
              className={`${pillBase} ${
                contaSelecionada === "todas" ? "bg-[var(--color-sixxis-navy)] text-white" : pillInativa
              }`}
            >
              Consolidado
            </button>
            {contas.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setContaSelecionada(c.id)}
                className={`${pillBase} ${
                  contaSelecionada === c.id ? "text-white" : pillInativa
                }`}
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
            <div className="flex-1 space-y-1.5">
              {matriz.map((horas, d) => {
                const totalDia = horas.reduce((s, q) => s + q, 0);
                return (
                  <div key={d} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-xs text-gray-500 dark:text-gray-400">
                      {DIAS_SEMANA_CURTO[d]}
                    </span>
                    <div className="flex flex-1 items-end gap-[2px]" style={{ height: 28 }}>
                      {horas.map((q, h) => (
                        <div
                          key={h}
                          title={`${DIAS_SEMANA[d]}, ${h}h: ${q} pedido(s)`}
                          className="flex-1 rounded-sm bg-[var(--color-sixxis-navy)]/70"
                          style={{ height: `${q > 0 ? Math.max((q / stats.maxCelula) * 100, 8) : 2}%` }}
                        />
                      ))}
                    </div>
                    <span className="w-8 shrink-0 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                      {totalDia}
                    </span>
                  </div>
                );
              })}
              <p className="pl-[88px] text-xs text-gray-400">0h às 23h (fuso de Brasília)</p>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
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

        <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
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
    </div>
  );
}
