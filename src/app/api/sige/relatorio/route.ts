import { NextResponse } from "next/server";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { buscarVendasMlAmazon, buscarVendasManuais, somarItensVendas } from "@/lib/sige/vendas";

// Relatorios do SIGE: agregacao sob demanda por conta (ML, Amazon ou canal
// manual) e periodo livre escolhido pelo usuario -- equivalente automatizado
// e flexivel das abas "Rel. Vendas" etc da planilha SIEGE, mas sem ficar
// preso aos 4 relatorios fixos: aqui o usuario escolhe contas + periodo +
// tipo de metrica.
//
// v1 cobre so o tipo "vendas" (vendas brutas/liquidas/canceladas/devolvidas).
// Visitas e Publicidade/Investimento/Retorno ficam desabilitados no seletor
// (relatorio-client.tsx) ate a proxima iteracao -- reaproveitarao
// lib/mercadolivre/visits.ts e lib/mercadolivre/ads.ts do mesmo jeito.
//
// A logica de busca por conta mora em lib/sige/vendas.ts, compartilhada com
// a rota de Fechamento Mensal (api/sige/fechamento) para os dois nunca
// divergirem no criterio de calculo.
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
  if (tipo !== "vendas") {
    return NextResponse.json({ erro: "Este tipo de relatorio ainda nao esta disponivel." }, { status: 400 });
  }

  const idsFiltro = contasParam ? contasParam.split(",").filter(Boolean) : null;

  const [itensAuto, itensManuais] = await Promise.all([
    buscarVendasMlAmazon(de, ate, idsFiltro),
    buscarVendasManuais(de, ate, idsFiltro),
  ]);

  const itens = [...itensAuto, ...itensManuais].sort((a, b) => a.nome.localeCompare(b.nome));
  const consolidado = somarItensVendas(itens);

  return NextResponse.json({ periodo: { de, ate }, consolidado, itens });
}
