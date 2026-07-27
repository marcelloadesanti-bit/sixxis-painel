// ROTA TEMPORARIA DE DEBUG (27/07/2026) -- investigar divergencia relatada
// pelo usuario entre o total de vendas pagas (vendas brutas) do nosso
// sistema e o painel oficial do Mercado Livre, nas contas AR e GO, para o
// periodo 01/07 ate agora. Hipoteses a testar:
// 1) "drift" de paginacao offset-based num periodo "ao vivo" (ate=hoje,
//    pedidos novos chegando durante a propria busca, sort=date_desc empurra
//    itens e pode fazer a pagina 2 pular um pedido).
// 2) temos usado order.date_created (criacao do pedido) -- se o painel do ML
//    usa outra data (ex: data de aprovacao do pagamento), pedidos criados
//    antes do periodo mas pagos dentro dele ficariam de fora da nossa busca.
// Sonda 3 formas diferentes de buscar os MESMOS pedidos pagos e compara os
// resultados entre si (nao chuta -- so reporta o que a API real devolve).

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getDevolucoesNoPeriodo } from "@/lib/mercadolivre/returns";
import { getReclamacoesNoPeriodo } from "@/lib/mercadolivre/claims";

const ML_API = "https://api.mercadolibre.com";

type PedidoApiDebug = {
  id: number;
  date_created: string;
  date_closed?: string | null;
  status: string;
  total_amount: number;
  paid_amount?: number;
};

async function buscarTudo(
  accessToken: string,
  mlUserId: number,
  status: string,
  desde: string,
  ate: string,
  sort: string,
  limitePorPagina: number
): Promise<{ pedidos: PedidoApiDebug[]; totalReportadoPorPagina: number[] }> {
  let offset = 0;
  const pedidos: PedidoApiDebug[] = [];
  const totalReportadoPorPagina: number[] = [];
  for (let i = 0; i < 20; i++) {
    const params = new URLSearchParams({
      seller: String(mlUserId),
      "order.status": status,
      "order.date_created.from": desde,
      "order.date_created.to": ate,
      sort,
      limit: String(limitePorPagina),
      offset: String(offset),
    });
    const res = await fetch(`${ML_API}/orders/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Falha (${status}, sort=${sort}): ${res.status} ${await res.text()}`);
    const data = (await res.json()) as { paging: { total: number }; results: PedidoApiDebug[] };
    totalReportadoPorPagina.push(data.paging.total);
    pedidos.push(...data.results);
    offset += limitePorPagina;
    if (offset >= data.paging.total || data.results.length === 0) break;
  }
  return { pedidos, totalReportadoPorPagina };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const nickname = searchParams.get("conta");
  const mlUserIdParam = searchParams.get("mluserid");
  const de = searchParams.get("de") ?? "2026-07-01";
  const ate = searchParams.get("ate") ?? "2026-07-27";

  const admin = createAdminClient();
  let query = admin.from("ml_accounts").select("id, ml_user_id, nickname").limit(1);
  if (mlUserIdParam) {
    query = admin.from("ml_accounts").select("id, ml_user_id, nickname").eq("ml_user_id", Number(mlUserIdParam)).limit(1);
  } else if (nickname) {
    query = admin.from("ml_accounts").select("id, ml_user_id, nickname").ilike("nickname", `%${nickname}%`).limit(1);
  }
  const { data: contas, error: erroContas } = await query;
  if (erroContas || !contas || contas.length === 0) {
    return NextResponse.json({ erro: "Conta nao encontrada", erroContas }, { status: 404 });
  }
  const conta = contas[0];

  const desde = `${de}T00:00:00.000-03:00`;
  const ateISO = `${ate}T23:59:59.999-03:00`;

  try {
    const accessToken = await getValidAccessToken(conta.id as string);

    const [pagoDesc50, pagoAsc50, pagoDesc100Unico, cancelDesc50, devolucoes, reclamacoes] = await Promise.all([
      buscarTudo(accessToken, conta.ml_user_id, "paid", desde, ateISO, "date_desc", 50),
      buscarTudo(accessToken, conta.ml_user_id, "paid", desde, ateISO, "date_asc", 50),
      buscarTudo(accessToken, conta.ml_user_id, "paid", desde, ateISO, "date_desc", 51),
      buscarTudo(accessToken, conta.ml_user_id, "cancelled", desde, ateISO, "date_desc", 50),
      getDevolucoesNoPeriodo(accessToken, conta.ml_user_id, { de, ate }, conta.id as string, conta.nickname as string),
      getReclamacoesNoPeriodo(accessToken, conta.ml_user_id, { de, ate }, conta.id as string, conta.nickname as string),
    ]);

    const idsCancelados = new Set(cancelDesc50.pedidos.map((p) => p.id));
    const claimIdParaResourceId = new Map(reclamacoes.map((r) => [r.id, r.resourceId]));
    const devolucoesTodas = [...devolucoes.abertas, ...devolucoes.concluidas];
    const overlapCanceladosComDevolucoes = devolucoesTodas
      .map((d) => ({ claimId: d.claimId, resourceId: claimIdParaResourceId.get(d.claimId) ?? null, custo: d.custo }))
      .filter((d) => d.resourceId !== null && idsCancelados.has(d.resourceId));

    // Probe extra: para cada pedido CANCELADO, busca direto se existe uma
    // reclamacao associada a ele (via resource_id), SEM restringir por data
    // de criacao da reclamacao -- testa a hipotese de que o pedido foi
    // devolvido (reclamacao aberta em outra data) e so DEPOIS o status do
    // pedido virou "cancelled", o que faria nossa contagem de "devolvidas"
    // (filtrada pela data da reclamacao) nao capturar o vinculo.
    const claimsPorPedidoCancelado = await Promise.all(
      cancelDesc50.pedidos.map(async (p) => {
        const res = await fetch(
          `${ML_API}/post-purchase/v1/claims/search?resource_id=${p.id}&resource=order`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (!res.ok) return { pedidoId: p.id, erro: `${res.status} ${await res.text()}` };
        const data = await res.json();
        return { pedidoId: p.id, resultadoBruto: data };
      })
    );

    // Probe extra 2: status/substatus do ENVIO de cada pedido cancelado --
    // testa a hipotese de que "devolvido" no painel do ML pode ser um estado
    // de LOGISTICA (pacote recusado / devolvido ao remetente) que nunca virou
    // uma reclamacao formal, e por isso nao aparece na busca por claims acima.
    const enviosPorPedidoCancelado = await Promise.all(
      cancelDesc50.pedidos.map(async (p) => {
        const res = await fetch(`${ML_API}/orders/${p.id}/shipments`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.status === 404) return { pedidoId: p.id, semEnvio: true };
        if (!res.ok) return { pedidoId: p.id, erro: `${res.status} ${await res.text()}` };
        const s = (await res.json()) as { status?: string; substatus?: string | null };
        return { pedidoId: p.id, status: s.status ?? null, substatus: s.substatus ?? null };
      })
    );

    const idsDesc50 = new Set(pagoDesc50.pedidos.map((p) => p.id));
    const idsAsc50 = new Set(pagoAsc50.pedidos.map((p) => p.id));
    const soDesc50 = [...idsDesc50].filter((id) => !idsAsc50.has(id));
    const soAsc50 = [...idsAsc50].filter((id) => !idsDesc50.has(id));

    const somaValor = (lista: PedidoApiDebug[]) =>
      Math.round(lista.reduce((s, p) => s + (p.total_amount ?? 0), 0) * 100) / 100;

    // Pedidos pagos cujo date_created cai nos 3 dias ANTES do periodo -- para
    // testar a hipotese de "data de criacao vs data de pagamento".
    const desdeAmpliado = new Date(new Date(desde).getTime() - 3 * 86400000).toISOString();
    const pagoJanelaAmpliada = await buscarTudo(
      accessToken,
      conta.ml_user_id,
      "paid",
      desdeAmpliado,
      ateISO,
      "date_desc",
      50
    );

    return NextResponse.json({
      conta: conta.nickname,
      periodo: { de, ate },
      probe_1_desc_paginado_50: {
        quantidade: pagoDesc50.pedidos.length,
        valor: somaValor(pagoDesc50.pedidos),
        totalReportadoPorPagina: pagoDesc50.totalReportadoPorPagina,
      },
      probe_2_asc_paginado_50: {
        quantidade: pagoAsc50.pedidos.length,
        valor: somaValor(pagoAsc50.pedidos),
        totalReportadoPorPagina: pagoAsc50.totalReportadoPorPagina,
      },
      probe_3_desc_pagina_unica_51: {
        quantidade: pagoDesc100Unico.pedidos.length,
        valor: somaValor(pagoDesc100Unico.pedidos),
        totalReportadoPorPagina: pagoDesc100Unico.totalReportadoPorPagina,
      },
      diferenca_entre_desc_e_asc: {
        somenteNoDesc50: soDesc50,
        somenteNoAsc50: soAsc50,
      },
      probe_4_janela_ampliada_3_dias_antes: {
        quantidade: pagoJanelaAmpliada.pedidos.length,
        valor: somaValor(pagoJanelaAmpliada.pedidos),
        pedidosAntesDoPeriodo: pagoJanelaAmpliada.pedidos
          .filter((p) => new Date(p.date_created).getTime() < new Date(desde).getTime())
          .map((p) => ({ id: p.id, date_created: p.date_created, total_amount: p.total_amount, status: p.status })),
      },
      cancelados: {
        quantidade: cancelDesc50.pedidos.length,
        valor: somaValor(cancelDesc50.pedidos),
        ids: cancelDesc50.pedidos.map((p) => ({ id: p.id, date_created: p.date_created, total_amount: p.total_amount })),
      },
      devolucoes: {
        quantidade: devolucoesTodas.length,
        custoTotal: devolucoes.custoTotal,
        detalhe: devolucoesTodas.map((d) => ({
          claimId: d.claimId,
          resourceId: claimIdParaResourceId.get(d.claimId) ?? null,
          status: d.status,
          custo: d.custo,
        })),
      },
      overlapCanceladosComDevolucoes,
      claimsPorPedidoCancelado,
      enviosPorPedidoCancelado,
    });
  } catch (err) {
    return NextResponse.json(
      { erro: err instanceof Error ? err.message : "Falha desconhecida" },
      { status: 500 }
    );
  }
}
