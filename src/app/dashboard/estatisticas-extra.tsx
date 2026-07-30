"use client";

import { useEffect, useState } from "react";

type Totais = { quantidade: number; valor: number; canceladas?: number };

type Dados = {
  hoje: Totais;
  ontem: Totais;
  semana: Totais;
  semanaAnterior: Totais;
  perguntas: { recebidas: number; respondidas: number };
  algumErro: boolean;
};

const formatarPct = (atual: number, anterior: number): string => {
  if (anterior === 0) return atual === 0 ? "0%" : "—";
  const pct = ((atual - anterior) / anterior) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
};

// Fase 5: cards "Estatística de vendas" e "Estatística da conta" do Resumo.
// Carrega os dados numa chamada separada (ver rota em
// /api/resumo/estatisticas-extra) para nao competir com o orcamento de
// tempo do carregamento principal da pagina -- ver comentario na rota.
export default function EstatisticasExtra({
  visitas,
  conversao,
  contasParam,
}: {
  visitas: { valor: number; variacaoPct: number | null };
  conversao: { valor: number; variacaoPct: number | null };
  contasParam: string;
}) {
  const [dados, setDados] = useState<Dados | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    fetch(`/api/resumo/estatisticas-extra?contas=${encodeURIComponent(contasParam)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelado) setDados(d);
      })
      .catch(() => {
        if (!cancelado) setDados(null);
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [contasParam]);

  return (
    <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Estatística de vendas</p>
        {carregando ? (
          <p className="text-sm text-gray-400">Carregando…</p>
        ) : !dados ? (
          <p className="text-sm text-gray-400">Não foi possível carregar agora.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-gray-500 dark:text-gray-400">Hoje / ontem</td>
                <td className="py-1 text-right">
                  {dados.hoje.quantidade} / {dados.ontem.quantidade}
                </td>
                <td className="py-1 pl-2 text-right text-xs text-gray-400">
                  {formatarPct(dados.hoje.quantidade, dados.ontem.quantidade)}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-gray-500 dark:text-gray-400">Esta semana / anterior</td>
                <td className="py-1 text-right">
                  {dados.semana.quantidade} / {dados.semanaAnterior.quantidade}
                </td>
                <td className="py-1 pl-2 text-right text-xs text-gray-400">
                  {formatarPct(dados.semana.quantidade, dados.semanaAnterior.quantidade)}
                </td>
              </tr>
              <tr>
                <td className="py-1 text-gray-500 dark:text-gray-400">Canceladas hoje</td>
                <td className="py-1 text-right" colSpan={2}>
                  {dados.hoje.canceladas ?? 0}
                </td>
              </tr>
            </tbody>
          </table>
        )}
        {dados?.algumErro && (
          <p className="mt-2 text-xs text-amber-600">Alguma conta falhou ao carregar — números podem estar incompletos.</p>
        )}
      </div>

      <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Estatística da conta</p>
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="py-1 text-gray-500 dark:text-gray-400">Visitas</td>
              <td className="py-1 text-right">{visitas.valor.toLocaleString("pt-BR")}</td>
              <td className="py-1 pl-2 text-right text-xs text-gray-400">
                {visitas.variacaoPct === null ? "—" : `${visitas.variacaoPct >= 0 ? "+" : ""}${visitas.variacaoPct.toFixed(0)}%`}
              </td>
            </tr>
            <tr>
              <td className="py-1 text-gray-500 dark:text-gray-400">Conversão</td>
              <td className="py-1 text-right">{conversao.valor.toFixed(2)}%</td>
              <td className="py-1 pl-2 text-right text-xs text-gray-400">
                {conversao.variacaoPct === null ? "—" : `${conversao.variacaoPct >= 0 ? "+" : ""}${conversao.variacaoPct.toFixed(0)}%`}
              </td>
            </tr>
            <tr>
              <td className="py-1 text-gray-500 dark:text-gray-400">Perguntas (semana)</td>
              <td className="py-1 text-right" colSpan={2}>
                {carregando || !dados ? "…" : `${dados.perguntas.respondidas} / ${dados.perguntas.recebidas}`}
              </td>
            </tr>
          </tbody>
        </table>
        <p className="mt-2 text-xs text-gray-400">Respondidas / recebidas nos últimos 7 dias.</p>
      </div>
    </div>
  );
}
