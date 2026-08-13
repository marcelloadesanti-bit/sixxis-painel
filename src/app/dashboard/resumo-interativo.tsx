"use client";


import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import VendasAoVivo from "./vendas-ao-vivo";


type PontoVendas = { data: string; quantidade: number; valor: number };
type PontoVisitas = { data: string; total: number };


export type ContaResumo = {
  id: string;
  nickname: string;
  cor: string;
};


export type SerieConta = {
  atual: { vendas: PontoVendas[]; visitas: PontoVisitas[] };
  anterior: { vendas: PontoVendas[]; visitas: PontoVisitas[] };
};


type MetricaKey = "vendasBrutas" | "quantidadeVendas" | "visualizacoes" | "conversao";


const METRICAS: { key: MetricaKey; label: string }[] = [
  { key: "vendasBrutas", label: "Vendas brutas" },
  { key: "quantidadeVendas", label: "Quantidade de vendas" },
  { key: "visualizacoes", label: "Visualizações" },
  { key: "conversao", label: "Conversão" },
];


// Gera a lista de datas (YYYY-MM-DD) entre de/ate, tratando as strings como
// datas de calendario "puras" (sem hora/timezone), via Date.UTC - evitando o
// bug classico de "new Date(str + 'T00:00:00')" mudar de dia dependendo do
// fuso horario do navegador de quem estiver vendo o painel.
function listarDatas(de: string, ate: string): string[] {
  const [anoDe, mesDe, diaDe] = de.split("-").map(Number);
  const [anoAte, mesAte, diaAte] = ate.split("-").map(Number);
  const datas: string[] = [];
  const cursor = new Date(Date.UTC(anoDe, mesDe - 1, diaDe));
  const fim = new Date(Date.UTC(anoAte, mesAte - 1, diaAte));
  while (cursor.getTime() <= fim.getTime()) {
    datas.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return datas;
}


function formatarDataCurta(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}


function valorMetricaDoDia(
  metrica: MetricaKey,
  vendas: PontoVendas | undefined,
  visitas: number
): number {
  switch (metrica) {
    case "vendasBrutas":
      return vendas?.valor ?? 0;
    case "quantidadeVendas":
      return vendas?.quantidade ?? 0;
    case "visualizacoes":
      return visitas;
    case "conversao":
      return visitas > 0 ? ((vendas?.quantidade ?? 0) / visitas) * 100 : 0;
  }
}


function formatarValor(metrica: MetricaKey, valor: number, moeda: string): string {
  if (metrica === "vendasBrutas") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(valor);
  }
  if (metrica === "conversao") {
    return `${valor.toFixed(2)}%`;
  }
  return new Intl.NumberFormat("pt-BR").format(Math.round(valor));
}


export default function ResumoInterativo({
  cards,
  moeda,
  periodo,
  contas,
  seriesPorConta,
  pizza,
}: {
  cards: {
    vendasBrutas: { valor: number; variacaoPct: number | null };
    quantidadeVendas: { valor: number; variacaoPct: number | null };
    visualizacoes: { valor: number; variacaoPct: number | null };
    conversao: { valor: number; variacaoPct: number | null };
  };
  moeda: string;
  periodo: { de: string; ate: string; deAnterior: string; ateAnterior: string };
  contas: ContaResumo[];
  seriesPorConta: Record<string, SerieConta>;
  pizza: { contaId: string; nickname: string; cor: string; valor: number }[];
}) {
  const [metrica, setMetrica] = useState<MetricaKey>("vendasBrutas");
  const [contaSelecionada, setContaSelecionada] = useState<string>("todas");


  const datasAtual = useMemo(() => listarDatas(periodo.de, periodo.ate), [periodo.de, periodo.ate]);
  const datasAnterior = useMemo(
    () => listarDatas(periodo.deAnterior, periodo.ateAnterior),
    [periodo.deAnterior, periodo.ateAnterior]
  );


  const contasParaSomar = contaSelecionada === "todas" ? contas : contas.filter((c) => c.id === contaSelecionada);
  // Quando "Consolidado" esta selecionado e ha mais de uma conta, o grafico
  // mostra uma linha por conta (cada uma na sua cor) em vez de somar tudo
  // numa unica linha neutra -- assim da pra ver a participacao de cada loja
  // na mesma visualizacao. Nesse modo nao mostramos a comparacao com o
  // periodo anterior (ficaria poluido com 2 linhas por conta); ela continua
  // disponivel selecionando uma conta especifica no filtro.
  const modoMultiConta = contaSelecionada === "todas" && contas.length > 1;


  // A linha usa a cor da conta selecionada. No modo "Consolidado" com uma
  // unica conta cadastrada, usa a cor dela mesma (ex: SIXXIS = rosa).
  const corLinha =
    contaSelecionada !== "todas"
      ? contas.find((c) => c.id === contaSelecionada)?.cor ?? "#64748b"
      : contas.length === 1
        ? contas[0].cor
        : "var(--color-sixxis-navy)";


  const dadosGrafico = useMemo(() => {
    if (modoMultiConta) {
      return datasAtual.map((diaAtual) => {
        const linha: Record<string, string | number> = { dia: formatarDataCurta(diaAtual) };
        for (const conta of contas) {
          const serie = seriesPorConta[conta.id];
          const vendaDia = serie?.atual.vendas.find((v) => v.data === diaAtual);
          const visitaDia = serie?.atual.visitas.find((v) => v.data === diaAtual)?.total ?? 0;
          linha[conta.id] = Math.round(valorMetricaDoDia(metrica, vendaDia, visitaDia) * 100) / 100;
        }
        return linha;
      });
    }


    return datasAtual.map((diaAtual, i) => {
      const diaAnterior = datasAnterior[i];


      let valorAtual = 0;
      let valorAnterior = 0;


      for (const conta of contasParaSomar) {
        const serie = seriesPorConta[conta.id];
        if (!serie) continue;


        const vendaAtualDia = serie.atual.vendas.find((v) => v.data === diaAtual);
        const visitaAtualDia = serie.atual.visitas.find((v) => v.data === diaAtual)?.total ?? 0;
        valorAtual += valorMetricaDoDia(metrica, vendaAtualDia, visitaAtualDia);


        if (diaAnterior) {
          const vendaAnteriorDia = serie.anterior.vendas.find((v) => v.data === diaAnterior);
          const visitaAnteriorDia = serie.anterior.visitas.find((v) => v.data === diaAnterior)?.total ?? 0;
          valorAnterior += valorMetricaDoDia(metrica, vendaAnteriorDia, visitaAnteriorDia);
        }
      }


      return {
        dia: formatarDataCurta(diaAtual),
        atual: Math.round(valorAtual * 100) / 100,
        anterior: Math.round(valorAnterior * 100) / 100,
      };
    });
  }, [datasAtual, datasAnterior, contasParaSomar, seriesPorConta, metrica, modoMultiConta, contas]);


  const semDados = modoMultiConta
    ? dadosGrafico.every((d) => contas.every((c) => (d[c.id] as number) === 0))
    : dadosGrafico.every((d) => (d as { atual: number; anterior: number }).atual === 0 && (d as { atual: number; anterior: number }).anterior === 0);


  return (
    <div>
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {METRICAS.map((m) => {
          const dado = cards[m.key];
          const ativo = metrica === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMetrica(m.key)}
              className={`rounded border bg-white p-4 text-left transition ${
                ativo
                  ? "border-t-4 border-t-[var(--color-sixxis-navy)] border-x-gray-200 border-b-gray-200 ring-1 ring-[var(--color-sixxis-navy)]/30"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <p className="text-xs uppercase text-gray-400">{m.label}</p>
              <p className="text-xl font-bold text-gray-900">
                {formatarValor(m.key, dado.valor, moeda)}
              </p>
              {dado.variacaoPct === null ? (
                <span className="text-xs text-gray-400">sem base de comparação</span>
              ) : (
                <span
                  className={`text-xs font-medium ${dado.variacaoPct >= 0 ? "text-green-600" : "text-red-500"}`}
                >
                  {dado.variacaoPct >= 0 ? "▲" : "▼"} {Math.abs(dado.variacaoPct).toFixed(1)}% vs. mês anterior
                </span>
              )}
            </button>
          );
        })}
      </div>


      <div className="mb-8 rounded border border-gray-200 bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-700">
            {METRICAS.find((m) => m.key === metrica)?.label} · período atual vs. anterior
          </h2>
          {contas.length > 0 && (
            <select
              value={contaSelecionada}
              onChange={(e) => setContaSelecionada(e.target.value)}
              className="rounded border border-gray-300 px-2 py-1 text-xs"
            >
              <option value="todas">Consolidado (todas as contas)</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nickname}
                </option>
              ))}
            </select>
          )}
        </div>


        {semDados ? (
          <p className="py-12 text-center text-sm text-gray-400">Sem dados para o período selecionado.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={dadosGrafico}>
              <defs>
                <linearGradient id="gradienteResumoAtual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={corLinha} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={corLinha} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(v) =>
                  metrica === "vendasBrutas"
                    ? `${(v / 1000).toFixed(0)}k`
                    : metrica === "conversao"
                      ? `${v}%`
                      : String(v)
                }
              />
              <Tooltip formatter={(value) => formatarValor(metrica, Number(value) || 0, moeda)} />
              <Legend />
              {modoMultiConta ? (
                contas.map((conta) => (
                  <Line
                    key={conta.id}
                    type="monotone"
                    dataKey={conta.id}
                    name={conta.nickname}
                    stroke={conta.cor}
                    strokeWidth={2}
                    dot={false}
                  />
                ))
              ) : (
                <>
                  <Area
                    type="monotone"
                    dataKey="atual"
                    name="Atual"
                    stroke={corLinha}
                    strokeWidth={2}
                    fill="url(#gradienteResumoAtual)"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="anterior"
                    name="Período anterior"
                    stroke={corLinha}
                    strokeOpacity={0.4}
                    strokeDasharray="5 4"
                    strokeWidth={2}
                    dot={false}
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>


      <VendasAoVivo />


      {pizza.length > 0 && (
        <div className="mb-8 rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">
            Participação de cada conta em vendas brutas no período
          </h2>
          <div className="flex flex-col items-center gap-4 sm:flex-row">
            <ResponsiveContainer width="100%" height={220} className="sm:max-w-[220px]">
              <PieChart>
                <Pie
                  data={pizza}
                  dataKey="valor"
                  nameKey="nickname"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {pizza.map((fatia) => (
                    <Cell key={fatia.contaId} fill={fatia.cor} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatarValor("vendasBrutas", Number(value) || 0, moeda)} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="flex flex-1 flex-col gap-2">
              {pizza.map((fatia) => {
                const total = pizza.reduce((s, f) => s + f.valor, 0);
                const pct = total > 0 ? (fatia.valor / total) * 100 : 0;
                return (
                  <li key={fatia.contaId} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: fatia.cor }}
                      />
                      {fatia.nickname}
                    </span>
                    <span className="text-gray-600">
                      {formatarValor("vendasBrutas", fatia.valor, moeda)} · {pct.toFixed(1)}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}




