import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import {
  buscarHistoricoMensal,
  encontrarMesAnterior,
  encontrarMesmoMesAnoAnterior,
  variacao,
  type LinhaHistoricoMensal,
} from "@/lib/sige/historico";

// Historico de Desempenho do SIGE -- equivalente automatizado das abas
// "Dashboard" / "Dashboard Ads" da planilha SIEGE. Populado automaticamente
// a cada Fechamento Mensal concluido (ver sige/fechamento) -- cada linha
// aqui e um snapshot congelado, nao um recalculo ao vivo.
//
// Duas tabelas: Historico Consolidado (receita liquida por canal, mes a
// mes) e Historico de Eficiencia de Ads (investimento/retorno/ROAS/TACoS/
// CTR do Mercado Ads consolidado, mes a mes). Ambas comparam com o mes
// calendario anterior E com o mesmo mes no ano anterior.
export const maxDuration = 30;

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarMoedaCompacta(v: number): string {
  if (Math.abs(v) >= 1000) return `R$ ${(v / 1000).toFixed(1).replace(".", ",")} mil`;
  return formatarMoeda(v);
}

function formatarPct(v: number | null): string {
  return v !== null ? `${(v * 100).toFixed(1)}%` : "—";
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

function somaPorTipo(linha: LinhaHistoricoMensal, tipo: "ml" | "amazon") {
  const canais = linha.porCanal.filter((c) => c.tipo === tipo);
  return {
    vendas: canais.reduce((s, c) => s + c.vendas, 0),
    faturamento: canais.reduce((s, c) => s + c.faturamento, 0),
  };
}

function somaCanalManual(linha: LinhaHistoricoMensal, nome: string) {
  const canal = linha.porCanal.find((c) => c.tipo === "manual" && c.nome === nome);
  return { vendas: canal?.vendas ?? 0, faturamento: canal?.faturamento ?? 0 };
}

// Status de eficiencia de ads: compara a variacao do ROAS mes a mes com a
// variacao do investimento -- mesmo criterio da aba "Dashboard Ads" da
// planilha (ver nota no rodape da tabela).
function statusEficiencia(deltaRoas: number | null, deltaInvest: number | null): string {
  if (deltaRoas === null) return "—";
  if (deltaRoas > 0.05 && deltaInvest !== null && deltaInvest < 0) return "🟢 +Efic. c/ -Gasto";
  if (deltaRoas > 0.05) return "🟢 +Eficiência";
  if (deltaRoas < -0.05) return "🔴 -Eficiência";
  return "⚪ Estável";
}

export default async function SigeHistoricoPage() {
  await exigirAcessoSecao("sige", "sige_historico");

  const linhas = await buscarHistoricoMensal(); // asc por mes
  const linhasDesc = [...linhas].reverse();

  const nomesCanaisManuais = Array.from(
    new Set(linhas.flatMap((l) => l.porCanal.filter((c) => c.tipo === "manual").map((c) => c.nome)))
  ).sort();

  const totalGeral = linhas.reduce((s, l) => s + l.totalFaturamento, 0);
  const totalGeralAds = {
    investimento: linhas.reduce((s, l) => s + l.ads.investimento, 0),
    retorno: linhas.reduce((s, l) => s + l.ads.retorno, 0),
  };

  return (
    <main className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">
        SIGE · Histórico de Desempenho
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Populado automaticamente sempre que um Fechamento Mensal é concluído. Cada mês é comparado com o mês
        calendário anterior e com o mesmo mês no ano anterior.
      </p>

      {linhas.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400 dark:border-gray-600">
          Nenhum fechamento realizado ainda.{" "}
          <a href="/dashboard/sige/fechamento" className="underline">
            Fazer o primeiro fechamento
          </a>
          .
        </p>
      ) : (
        <>
          <h2 className="mb-2 mt-2 text-sm font-semibold uppercase text-gray-500">Histórico Consolidado</h2>
          <div className="mb-8 overflow-x-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                  <th className="p-3">Mês</th>
                  <th className="p-3 text-right">ML Vendas Líq.</th>
                  <th className="p-3 text-right">ML Fat. Líq. (R$)</th>
                  <th className="p-3 text-right">Amazon Vendas</th>
                  <th className="p-3 text-right">Amazon Fat. (R$)</th>
                  {nomesCanaisManuais.map((nome) => (
                    <th key={nome} className="p-3 text-right">
                      {nome} Fat. (R$)
                    </th>
                  ))}
                  <th className="p-3 text-right">Total Fat. (R$)</th>
                  <th className="p-3 text-right">vs Mês Ant.</th>
                  <th className="p-3 text-right">vs Ano Ant.</th>
                </tr>
              </thead>
              <tbody>
                {linhasDesc.map((linha) => {
                  const idxAsc = linhas.findIndex((l) => l.mesChave === linha.mesChave);
                  const anterior = encontrarMesAnterior(linhas, idxAsc);
                  const anoAnterior = encontrarMesmoMesAnoAnterior(linhas, linha.mesChave);
                  const ml = somaPorTipo(linha, "ml");
                  const amazon = somaPorTipo(linha, "amazon");
                  return (
                    <tr key={linha.mesChave} className="border-b border-gray-50 last:border-0 dark:border-gray-700/50">
                      <td className="p-3 font-medium">{linha.rotulo}</td>
                      <td className="p-3 text-right">{ml.vendas}</td>
                      <td className="p-3 text-right">{formatarMoeda(ml.faturamento)}</td>
                      <td className="p-3 text-right">{amazon.vendas}</td>
                      <td className="p-3 text-right">{formatarMoeda(amazon.faturamento)}</td>
                      {nomesCanaisManuais.map((nome) => (
                        <td key={nome} className="p-3 text-right">
                          {formatarMoeda(somaCanalManual(linha, nome).faturamento)}
                        </td>
                      ))}
                      <td className="p-3 text-right font-semibold">{formatarMoeda(linha.totalFaturamento)}</td>
                      <td className="p-3 text-right">
                        <Variacao v={anterior ? variacao(linha.totalFaturamento, anterior.totalFaturamento) : null} />
                      </td>
                      <td className="p-3 text-right">
                        <Variacao v={anoAnterior ? variacao(linha.totalFaturamento, anoAnterior.totalFaturamento) : null} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 text-xs text-gray-500 dark:border-gray-700">
                  <td className="p-3 font-semibold">Total geral</td>
                  <td colSpan={3 + nomesCanaisManuais.length} />
                  <td className="p-3 text-right font-semibold">{formatarMoedaCompacta(totalGeral)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          <h2 className="mb-2 mt-2 text-sm font-semibold uppercase text-gray-500">Histórico de Eficiência de Ads</h2>
          <p className="mb-2 text-xs text-gray-400">
            Consolidado do Mercado Ads (todas as lojas) + Google Ads / Meta Ads lançados no fechamento.
          </p>
          <div className="overflow-x-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                  <th className="p-3">Mês</th>
                  <th className="p-3 text-right">Investimento (R$)</th>
                  <th className="p-3 text-right">Retorno (R$)</th>
                  <th className="p-3 text-right">Nº Vendas</th>
                  <th className="p-3 text-right">ROAS</th>
                  <th className="p-3 text-right">TACoS</th>
                  <th className="p-3 text-right">CTR</th>
                  <th className="p-3 text-right">Δ Invest. vs Mês Ant.</th>
                  <th className="p-3 text-right">Δ ROAS vs Mês Ant.</th>
                  <th className="p-3 text-right">Δ ROAS vs Ano Ant.</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {linhasDesc.map((linha) => {
                  const idxAsc = linhas.findIndex((l) => l.mesChave === linha.mesChave);
                  const anterior = encontrarMesAnterior(linhas, idxAsc);
                  const anoAnterior = encontrarMesmoMesAnoAnterior(linhas, linha.mesChave);
                  const deltaInvest = anterior ? variacao(linha.ads.investimento, anterior.ads.investimento) : null;
                  const deltaRoasMes =
                    anterior && anterior.ads.roas ? variacao(linha.ads.roas ?? 0, anterior.ads.roas) : null;
                  const deltaRoasAno =
                    anoAnterior && anoAnterior.ads.roas ? variacao(linha.ads.roas ?? 0, anoAnterior.ads.roas) : null;
                  return (
                    <tr key={linha.mesChave} className="border-b border-gray-50 last:border-0 dark:border-gray-700/50">
                      <td className="p-3 font-medium">{linha.rotulo}</td>
                      <td className="p-3 text-right">{formatarMoeda(linha.ads.investimento)}</td>
                      <td className="p-3 text-right">{formatarMoeda(linha.ads.retorno)}</td>
                      <td className="p-3 text-right">{linha.ads.vendas}</td>
                      <td className="p-3 text-right">{linha.ads.roas !== null ? `${linha.ads.roas.toFixed(2)}x` : "—"}</td>
                      <td className="p-3 text-right">{formatarPct(linha.ads.tacos)}</td>
                      <td className="p-3 text-right">{formatarPct(linha.ads.ctr)}</td>
                      <td className="p-3 text-right">
                        <Variacao v={deltaInvest} />
                      </td>
                      <td className="p-3 text-right">
                        <Variacao v={deltaRoasMes} />
                      </td>
                      <td className="p-3 text-right">
                        <Variacao v={deltaRoasAno} />
                      </td>
                      <td className="p-3 text-xs">{statusEficiencia(deltaRoasMes, deltaInvest)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 text-xs text-gray-500 dark:border-gray-700">
                  <td className="p-3 font-semibold">Total acumulado</td>
                  <td className="p-3 text-right font-semibold">{formatarMoedaCompacta(totalGeralAds.investimento)}</td>
                  <td className="p-3 text-right font-semibold">{formatarMoedaCompacta(totalGeralAds.retorno)}</td>
                  <td colSpan={8} />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            🟢 Eficiência melhorou (ROAS +5% ou mais) · 🔴 Eficiência piorou (ROAS -5% ou mais) · ⚪ Estável (variação
            até 5%) · 🟢 +Efic. c/ -Gasto = ROAS melhorou investindo menos.
          </p>
        </>
      )}
    </main>
  );
}
