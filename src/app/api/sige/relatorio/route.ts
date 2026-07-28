import { NextResponse } from "next/server";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { buscarVendasMlAmazon, buscarVendasManuais, somarItensVendas } from "@/lib/sige/vendas";
import { buscarAdsMl, buscarAdsManuais, somarItensAds } from "@/lib/sige/ads";

// Relatorios do SIGE: agregacao sob demanda por conta (ML, Amazon ou canal
// manual) e periodo livre escolhido pelo usuario -- equivalente automatizado
// e flexivel das abas "Rel. Vendas" etc da planilha SIEGE, mas sem ficar
// preso aos relatorios fixos: aqui o usuario escolhe contas + periodo + tipo
// de metrica.
//
// v1 cobria so "vendas". Agora cobre tambem "ads" (Publicidade /
// Investimento / Retorno: Mercado Ads real + Google Ads / Meta Ads
// lancados manualmente no Fechamento Mensal), com ROAS/ACOS/TACOS/CTR
// calculados aqui. Visitas continua desabilitado no seletor
// (relatorio-client.tsx) ate a proxima iteracao -- reaproveitara
// lib/mercadolivre/visits.ts do mesmo jeito.
//
// A logica de busca por conta mora em lib/sige/vendas.ts e lib/sige/ads.ts,
// compartilhada com a rota de Fechamento Mensal (api/sige/fechamento) para
// os dois nunca divergirem no criterio de calculo.
export const maxDuration = 60;

export async function GET(request: Request) {
  await exigirAcessoSecao("sige", "sige_relatorios");

  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo") ?? "vendas";
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
