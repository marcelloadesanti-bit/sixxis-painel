import { NextResponse } from "next/server";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { buscarVendasMlAmazon, buscarVendasManuais, somarItensVendas } from "@/lib/sige/vendas";
import { buscarAdsMl, buscarAdsManuais, somarItensAds } from "@/lib/sige/ads";
import { buscarHistoricoMensal, encontrarMesAnterior, encontrarMesmoMesAnoAnterior, variacao } from "@/lib/sige/historico";

// Relatorios do SIGE: agregacao sob demanda por conta (ML, Amazon ou canal
// manual) e periodo livre escolhido pelo usuario -- equivalente automatizado
// e flexivel das abas "Rel. Vendas" etc da planilha SIEGE, mas sem ficar
// preso aos relatorios fixos: aqui o usuario escolhe contas + periodo + tipo
// de metrica.
//
// v1 cobria so "vendas". Depois ganhou "ads" (Publicidade / Investimento /
// Retorno). Agora ganha "crescimento" -- esse tipo e diferente dos outros
// dois: nao e "ao vivo" (nao aceita periodo/contas), e sim o equivalente
// automatizado da aba "Rel. Crescimento" da planilha SIEGE -- le os
// fechamentos ja CONGELADOS (via lib/sige/historico.ts) e mostra o
// desempenho do ultimo mes fechado comparado com o mes anterior e o mesmo
// mes do ano anterior, mais uma tendencia dos ultimos 12 meses. Visitas
// continua desabilitado no seletor (relatorio-client.tsx) ate a proxima
// iteracao -- reaproveitara lib/mercadolivre/visits.ts do mesmo jeito.
//
// A logica de busca por conta mora em lib/sige/vendas.ts e lib/sige/ads.ts,
// compartilhada com a rota de Fechamento Mensal (api/sige/fechamento) para
// os dois nunca divergirem no criterio de calculo. lib/sige/historico.ts
// e a mesma lib usada pela pagina de Historico de Desempenho.
export const maxDuration = 60;

type FormatoIndicador = "moeda" | "numero" | "pct" | "roas";

function indicador(
  nome: string,
  formato: FormatoIndicador,
  valor: number,
  valorAnterior: number | null | undefined,
  valorAnoAnterior: number | null | undefined
) {
  return {
    nome,
    formato,
    valor,
    vsMesAnterior: variacao(valor, valorAnterior),
    vsAnoAnterior: variacao(valor, valorAnoAnterior),
  };
}

export async function GET(request: Request) {
  await exigirAcessoSecao("sige", "sige_relatorios");

  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo") ?? "vendas";

  // Relatorio de Crescimento: le fechamentos congelados, sem periodo/contas.
  if (tipo === "crescimento") {
    const linhas = await buscarHistoricoMensal(); // asc por mes

    if (linhas.length === 0) {
      return NextResponse.json({ tipo, mesAtual: null, historico: [] });
    }

    const idxAtual = linhas.length - 1;
    const atual = linhas[idxAtual];
    const anterior = encontrarMesAnterior(linhas, idxAtual);
    const anoAnterior = encontrarMesmoMesAnoAnterior(linhas, atual.mesChave);

    const tacosPct = (v: number | null) => (v !== null ? v * 100 : null);

    const indicadores = [
      indicador("Faturamento Total", "moeda", atual.totalFaturamento, anterior?.totalFaturamento, anoAnterior?.totalFaturamento),
      indicador("Vendas Líquidas", "numero", atual.totalVendas, anterior?.totalVendas, anoAnterior?.totalVendas),
      indicador(
        "Investimento em Ads",
        "moeda",
        atual.ads.investimento,
        anterior?.ads.investimento,
        anoAnterior?.ads.investimento
      ),
      indicador("ROAS", "roas", atual.ads.roas ?? 0, anterior?.ads.roas ?? null, anoAnterior?.ads.roas ?? null),
      indicador(
        "TACoS",
        "pct",
        tacosPct(atual.ads.tacos) ?? 0,
        tacosPct(anterior?.ads.tacos ?? null),
        tacosPct(anoAnterior?.ads.tacos ?? null)
      ),
    ];

    const historico = linhas.slice(-12).map((l) => ({
      mesChave: l.mesChave,
      rotulo: l.rotulo,
      totalFaturamento: l.totalFaturamento,
      totalVendas: l.totalVendas,
      investimentoAds: l.ads.investimento,
      roas: l.ads.roas,
    }));

    return NextResponse.json({
      tipo,
      mesAtual: {
        rotulo: atual.rotulo,
        periodoDe: atual.periodoDe,
        periodoAte: atual.periodoAte,
        indicadores,
      },
      historico,
    });
  }

  const de = searchParams.get("de");
  const ate = searchParams.get("ate");
  const contasParam = searchParams.get("contas");

  if (!de || !ate) {
    return NextResponse.json({ erro: "Periodo (de/ate) obrigatorio." }, { status: 400 });
  }
  if (tipo !== "vendas" && tipo !== "ads") {
    return NextResponse.json({ erro: "Este tipo de relatorio ainda nao esta disponivel." }, { status: 400 });
  }

  const idsFiltro = contasParam ? contasParam.split(",").filter(Boolean) : null;

  if (tipo === "ads") {
    const [itensMl, itensManuais, vendasAuto, vendasManuais] = await Promise.all([
      buscarAdsMl(de, ate, idsFiltro),
      buscarAdsManuais(de, ate),
      buscarVendasMlAmazon(de, ate, null),
      buscarVendasManuais(de, ate, null),
    ]);

    const itens = [...itensMl, ...itensManuais].sort((a, b) => a.nome.localeCompare(b.nome));
    const brutoConsolidado = somarItensAds(itens);
    // TACOS precisa do faturamento TOTAL da empresa no periodo (todas as
    // vendas, nao so as atribuidas a ads) -- reaproveita a lib de vendas.
    const faturamentoTotalEmpresa = somarItensVendas([...vendasAuto, ...vendasManuais]).faturamentoBruto;

    const comMetricas = (investimento: number, retorno: number, impressoes: number, cliques: number) => ({
      roas: investimento > 0 ? retorno / investimento : null,
      acos: retorno > 0 ? (investimento / retorno) * 100 : null,
      tacos: faturamentoTotalEmpresa > 0 ? (investimento / faturamentoTotalEmpresa) * 100 : null,
      ctr: impressoes > 0 ? (cliques / impressoes) * 100 : null,
    });

    const itensComMetricas = itens.map((i) => ({
      ...i,
      ...comMetricas(i.investimento, i.retorno, i.impressoes, i.cliques),
    }));
    const consolidado = {
      ...brutoConsolidado,
      ...comMetricas(
        brutoConsolidado.investimento,
        brutoConsolidado.retorno,
        brutoConsolidado.impressoes,
        brutoConsolidado.cliques
      ),
      faturamentoTotalEmpresa,
    };

    return NextResponse.json({ tipo, periodo: { de, ate }, consolidado, itens: itensComMetricas });
  }

  const [itensAuto, itensManuaisVendas] = await Promise.all([
    buscarVendasMlAmazon(de, ate, idsFiltro),
    buscarVendasManuais(de, ate, idsFiltro),
  ]);

  const itens = [...itensAuto, ...itensManuaisVendas].sort((a, b) => a.nome.localeCompare(b.nome));
  const consolidado = somarItensVendas(itens);

  return NextResponse.json({ tipo, periodo: { de, ate }, consolidado, itens });
}
