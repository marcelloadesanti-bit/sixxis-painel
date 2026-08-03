// Financeiro > Margem Bruta -- calculo de margem por pedido/SKU a partir de
// dados que ja circulam no painel (Vendas), sem nenhuma fonte nova de dados:
//
// - Venda bruta: Pedido.valor (total_amount, mesmo criterio ja usado em
//   Vendas/SIGE -- nao inclui frete pago pelo comprador).
// - Comissao da plataforma: Pedido.taxaPlataforma / item.taxaPlataforma
//   (sale_fee, ja vem de graca no /orders/search).
// - Frete: custo efetivamente debitado do vendedor (ver getEnvioPedido em
//   orders.ts), resolvido via o MESMO cache permanente ja usado por "Vendas
//   por estado" (pedido_envio_cache, ver estado-cache.ts) -- reaproveita a
//   mesma chamada de shipment, sem nenhum custo extra de API.
//
// 03/08/2026: decisao explicita do usuario -- por enquanto NAO existe custo
// de produto (CMV) no calculo. Isso fica para a futura aba Custos (Financeiro),
// ainda em standby. "Margem Bruta" aqui e: Venda bruta - Comissao - Frete -
// Outros custos (cupom/desconto, hoje sempre 0 -- ver nota em outrosCustos).
// Rateio de frete entre itens de um mesmo pedido: dividido IGUALMENTE entre
// os itens (decisao explicita do usuario, independente do valor de cada um).

import type { Pedido } from "./orders";

export type LinhaMargem = {
  id: number;
  dataCriacao: string;
  contaId: string;
  contaNickname: string;
  comprador: string;
  compradorId: number | null;
  produto: string;
  moeda: string;
  vendaBruta: number;
  taxaPlataforma: number;
  // null = frete ainda nao resolvido nesta carga (cache incompleto/em
  // preenchimento) -- ver amostraParcialFrete no agregado consolidado.
  custoFrete: number | null;
  // Reservado para cupom/desconto por pedido -- a API de Orders do Mercado
  // Livre nao expoe de forma confiavel um custo de cupom "custeado pelo
  // vendedor" por pedido individual (isso aparece agregado por conta/mes no
  // Faturamento, nao por pedido). Fica em 0 por enquanto; se um dado
  // confiavel por pedido for encontrado no futuro, entra aqui sem mudar o
  // resto do calculo.
  outrosCustos: number;
  margemValor: number | null; // null quando custoFrete ainda nao resolvido
  margemPct: number | null; // null quando vendaBruta <= 0 ou custoFrete nao resolvido
};

export type ItemMargem = {
  itemId: string;
  titulo: string;
  quantidade: number;
  valor: number;
  taxaPlataforma: number;
  custoFrete: number; // soma so das ocorrencias com frete ja resolvido
  pedidosComFrete: number;
  pedidosSemFrete: number;
  margemValor: number;
  margemPct: number | null;
};

export type MargemConsolidado = {
  totalPedidos: number;
  vendaBruta: number;
  taxaPlataforma: number;
  custoFrete: number; // soma so dos pedidos com frete resolvido
  outrosCustos: number;
  margemValor: number;
  margemPct: number | null;
  pedidosComFreteResolvido: number;
  pedidosSemFreteResolvido: number;
  amostraParcialFrete: boolean;
  moeda: string;
};

export function montarLinhasMargem(
  pedidos: Pedido[],
  custoFretePorPedido: Map<number, number | null>
): LinhaMargem[] {
  return pedidos.map((p) => {
    // 03/08/2026 (correcao bug "frete zerado"): antes, se o pedido estivesse
    // no mapa mas com valor null (frete ainda nao resolvido -- ver nota em
    // estado-cache.ts), o `?? 0` abaixo transformava "nao resolvido" em
    // "resolvido como R$0,00", entao a margem aparecia calculada (e maior
    // do que deveria) mesmo sem o frete ter sido descontado. Agora null
    // (seja por ausencia no mapa, seja por presenca com valor null) sempre
    // vira null aqui, e so mostra "calculando..." na tela em vez de somar
    // R$0,00 de frete por engano.
    const custoFrete = custoFretePorPedido.get(p.id) ?? null;
    const outrosCustos = 0;
    const margemValor = custoFrete !== null ? p.valor - p.taxaPlataforma - custoFrete - outrosCustos : null;
    const margemPct = margemValor !== null && p.valor > 0 ? (margemValor / p.valor) * 100 : null;
    return {
      id: p.id,
      dataCriacao: p.dataCriacao,
      contaId: p.contaId,
      contaNickname: p.contaNickname,
      comprador: p.comprador,
      compradorId: p.compradorId,
      produto: p.produto,
      moeda: p.moeda,
      vendaBruta: p.valor,
      taxaPlataforma: p.taxaPlataforma,
      custoFrete,
      outrosCustos,
      margemValor,
      margemPct,
    };
  });
}

export function consolidarMargem(linhas: LinhaMargem[], moeda: string): MargemConsolidado {
  let vendaBruta = 0;
  let taxaPlataforma = 0;
  let custoFrete = 0;
  let outrosCustos = 0;
  let pedidosComFreteResolvido = 0;
  let pedidosSemFreteResolvido = 0;

  for (const l of linhas) {
    vendaBruta += l.vendaBruta;
    taxaPlataforma += l.taxaPlataforma;
    outrosCustos += l.outrosCustos;
    if (l.custoFrete !== null) {
      custoFrete += l.custoFrete;
      pedidosComFreteResolvido++;
    } else {
      pedidosSemFreteResolvido++;
    }
  }

  // Margem consolidada usa so os pedidos com frete ja resolvido para o
  // custo de frete (senao subestimaria o custo real) -- mas a comissao e a
  // venda bruta somam TODOS os pedidos (esses dois dados nunca dependem do
  // cache de shipment). Isso significa que, com o cache ainda "frio", a
  // margem % consolidada pode aparecer um pouco otimista ate o cache
  // preencher -- por isso o aviso de amostra parcial abaixo.
  const margemValor = vendaBruta - taxaPlataforma - custoFrete - outrosCustos;
  const margemPct = vendaBruta > 0 ? (margemValor / vendaBruta) * 100 : null;

  return {
    totalPedidos: linhas.length,
    vendaBruta,
    taxaPlataforma,
    custoFrete,
    outrosCustos,
    margemValor,
    margemPct,
    pedidosComFreteResolvido,
    pedidosSemFreteResolvido,
    amostraParcialFrete: pedidosSemFreteResolvido > 0,
    moeda,
  };
}

// Ranking por SKU: comissao vem do sale_fee do proprio item (exato, nao
// precisa ratear); frete e rateado IGUALMENTE entre os itens de cada pedido
// (decisao explicita do usuario) -- so soma frete nos pedidos onde o custo
// ja foi resolvido (pedidosSemFrete conta os que faltam, para o card avisar
// quando o ranking de um SKU especifico ainda esta incompleto).
export function montarRankingPorSku(
  pedidos: Pedido[],
  custoFretePorPedido: Map<number, number | null>
): ItemMargem[] {
  const porSku = new Map<string, ItemMargem>();

  for (const p of pedidos) {
    const numItens = p.itens.length;
    if (numItens === 0) continue;
    const custoFretePedido = custoFretePorPedido.has(p.id) ? custoFretePorPedido.get(p.id) : undefined;
    const freteRateado = custoFretePedido != null ? custoFretePedido / numItens : null;

    for (const it of p.itens) {
      const atual = porSku.get(it.itemId) ?? {
        itemId: it.itemId,
        titulo: it.titulo,
        quantidade: 0,
        valor: 0,
        taxaPlataforma: 0,
        custoFrete: 0,
        pedidosComFrete: 0,
        pedidosSemFrete: 0,
        margemValor: 0,
        margemPct: null,
      };
      atual.quantidade += it.quantidade;
      atual.valor += it.valor;
      atual.taxaPlataforma += it.taxaPlataforma;
      if (freteRateado !== null) {
        atual.custoFrete += freteRateado;
        atual.pedidosComFrete += 1;
      } else {
        atual.pedidosSemFrete += 1;
      }
      porSku.set(it.itemId, atual);
    }
  }

  return Array.from(porSku.values())
    .map((item) => {
      const margemValor = item.valor - item.taxaPlataforma - item.custoFrete;
      const margemPct = item.valor > 0 ? (margemValor / item.valor) * 100 : null;
      return { ...item, margemValor, margemPct };
    })
    .sort((a, b) => a.titulo.localeCompare(b.titulo));
}
