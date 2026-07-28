import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/amazon/token";
import { getVendas, periodoDeDatas } from "@/lib/amazon/orders";
import { getFaturamento } from "@/lib/amazon/finances";

// Rota de debug TEMPORARIA -- criada para diagnosticar por que as paginas
// Amazon > Vendas / Faturamento estao vindo zeradas mesmo sem erro.
// Busca um periodo BEM mais largo (365 dias) para descartar filtro de data
// e expõe qualquer erro real da SP-API que o try/catch das paginas normais
// esconde atras de "Falha ao buscar". Remover apos o diagnostico (mesmo
// padrao usado antes para o debug de Faturamento do ML).
export const maxDuration = 60;

export async function GET() {
  const admin = createAdminClient();
  const { data: contas, error } = await admin
    .from("amazon_accounts")
    .select("id, nickname, seller_id, marketplace_id, refresh_token, access_token, token_expires_at");

  if (error || !contas || contas.length === 0) {
    return NextResponse.json({ erro: "Nenhuma conta amazon encontrada", detalhe: error }, { status: 500 });
  }

  const hoje = new Date();
  const de = new Date(hoje.getTime() - 365 * 86400000);
  const periodo = periodoDeDatas(de.toISOString().slice(0, 10), hoje.toISOString().slice(0, 10));

  // Finances API (PostedAfter/PostedBefore) tem um limite documentado de 180
  // dias de intervalo -- testamos Faturamento com uma janela de 30 dias em
  // paralelo para confirmar se o 400 no periodo de 365 dias e so por causa
  // desse limite (e nao um problema generalizado).
  const de30 = new Date(hoje.getTime() - 30 * 86400000);
  const periodoCurto = periodoDeDatas(de30.toISOString().slice(0, 10), hoje.toISOString().slice(0, 10));

  const resultados: any[] = [];

  for (const conta of contas) {
    const linha: any = {
      nickname: conta.nickname,
      seller_id: conta.seller_id,
      marketplace_id: conta.marketplace_id,
      temRefreshToken: Boolean(conta.refresh_token),
    };

    try {
      const accessToken = await getValidAccessToken(conta.id);
      linha.tokenOk = true;
      linha.accessTokenPrefix = accessToken.slice(0, 15);

      try {
        const vendas = await getVendas(accessToken, conta.marketplace_id as string, periodo, conta.id, conta.nickname as string);
        linha.vendas = {
          totalPedidos: vendas.totalPedidos,
          valorSomado: vendas.valorSomado,
          unidadesVendidas: vendas.unidadesVendidas,
          moeda: vendas.moeda,
          amostraPedidos: vendas.pedidos.slice(0, 3),
        };
      } catch (e: any) {
        linha.vendasErro = e?.message ?? String(e);
      }

      try {
        const faturamento = await getFaturamento(accessToken, periodo);
        linha.faturamento = faturamento;
      } catch (e: any) {
        linha.faturamentoErro = e?.message ?? String(e);
      }

      try {
        const faturamento30 = await getFaturamento(accessToken, periodoCurto);
        linha.faturamento30dias = faturamento30;
      } catch (e: any) {
        linha.faturamento30diasErro = e?.message ?? String(e);
      }
    } catch (e: any) {
      linha.tokenErro = e?.message ?? String(e);
    }

    resultados.push(linha);
  }

  return NextResponse.json({ periodoTestado: periodo, resultados });
}
