import { NextResponse } from "next/server";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { buscarComercialMes, salvarComercialMes } from "@/lib/sige/comercial";

// Lancamento manual do setor Comercial (vendas fechadas por dentro do ML
// pelo time comercial, fora do fluxo normal de contas) -- um unico valor
// consolidado por mes, editado a partir do card "Comercial" em Relatorios
// (Vendas). Ver lib/sige/comercial.ts para o motivo da chave ser o mes
// calendario. O mesmo valor e lido (sem edicao) pelo Fechamento Mensal e
// pelo calculo automatico de Comissao.
export const maxDuration = 30;

export async function GET(request: Request) {
  await exigirAcessoSecao("sige", "sige_relatorios");

  const { searchParams } = new URL(request.url);
  const ano = Number(searchParams.get("ano"));
  const mes = Number(searchParams.get("mes"));
  if (!ano || !mes || mes < 1 || mes > 12) {
    return NextResponse.json({ erro: "Parametros ano e mes sao obrigatorios." }, { status: 400 });
  }

  const lancamento = await buscarComercialMes(ano, mes);
  return NextResponse.json({
    ano,
    mes,
    numeroVendas: lancamento?.numeroVendas ?? 0,
    valorTotal: lancamento?.valorTotal ?? 0,
    atualizadoEm: lancamento?.atualizadoEm ?? null,
  });
}

export async function POST(request: Request) {
  const { user, podeEditar } = await exigirAcessoSecao("sige", "sige_relatorios");
  if (!podeEditar) {
    return NextResponse.json({ erro: "Sem permissao para editar." }, { status: 403 });
  }

  const body = (await request.json()) as {
    ano?: number;
    mes?: number;
    numeroVendas?: number;
    valorTotal?: number;
  };
  const ano = Number(body.ano);
  const mes = Number(body.mes);
  const numeroVendas = Number(body.numeroVendas ?? 0);
  const valorTotal = Number(body.valorTotal ?? 0);

  if (!ano || !mes || mes < 1 || mes > 12) {
    return NextResponse.json({ erro: "Parametros ano e mes sao obrigatorios." }, { status: 400 });
  }
  if (!Number.isFinite(numeroVendas) || !Number.isFinite(valorTotal) || numeroVendas < 0 || valorTotal < 0) {
    return NextResponse.json({ erro: "Valores invalidos." }, { status: 400 });
  }

  const { error } = await salvarComercialMes(ano, mes, numeroVendas, valorTotal, user.id);
  if (error) {
    return NextResponse.json({ erro: "Falha ao salvar." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, ano, mes, numeroVendas, valorTotal });
}
