// Cache permanente (Supabase, tabela pedido_envio_cache) de estado/cidade
// resolvido por pedido -- usado pelo agregado "Vendas por estado" (Metricas)
// e pelo Historico. O endereco do comprador NAO vem no /orders/search do ML,
// exige 1 chamada de shipment por pedido (ver resolverEstadoPedidos em
// orders.ts). Por isso guardamos o resultado permanentemente: um pedido ja
// resolvido nunca mais precisa ser buscado de novo -- cada visita a
// Vendas/Metricas preenche um pouco mais o cache, ate cobrir 100% do
// historico, sem nunca precisar escanear um periodo inteiro de uma vez so.
//
// 03/08/2026 (Margem Bruta): o mesmo shipment que resolve estado/cidade ja
// trazia o custo do frete (EnvioPedido.custoFrete) -- so nao era persistido.
// Agora a coluna custo_frete tambem e gravada/lida junto, e o resultado
// devolve um mapa pedidoId -> custoFrete (custoFretePorPedido) para a nova
// aba Financeiro > Margem Bruta reaproveitar exatamente esta mesma
// infraestrutura de cache (sem tabela nova, sem chamada extra a API).

import { resolverEstadoPedidos, type PontoEstado } from "./orders";

// Tipagem minima do client Supabase server-side (@/lib/supabase/server) --
// evita import circular/pesado do tipo gerado, so precisamos de `.from()`.
type ClienteSupabase = {
  from: (table: string) => any;
};

export type ResultadoEstadoPeriodo = {
  porEstado: PontoEstado[];
  totalResolvidos: number;
  totalPeriodo: number;
  amostraParcial: boolean;
  // Fase 10 (30/07/2026): mapa pedidoId -> nome do estado, restrito aos
  // pedidos passados nesta chamada (pedidosPorConta) -- permite ao chamador
  // (paginas de Vendas/Metricas) cruzar com todosPedidos (que ja tem valor,
  // compradorId e itens) e montar agregados por estado (clientes, valor,
  // SKU) sem nenhuma chamada nova a API do ML nem ao banco. porEstado acima
  // continua so com a contagem (usado pela lista de texto existente).
  estadoPorPedido: Map<number, string>;
  // 03/08/2026: mesma ideia, mas para o custo de frete -- usado pela aba
  // Financeiro > Margem Bruta. Pedidos ainda nao resolvidos (nem em cache
  // nem buscados nesta carga, por causa do teto de novas buscas) ficam de
  // fora do mapa -- o chamador decide como tratar a ausencia (normalmente:
  // excluir do consolidado e sinalizar "amostra parcial").
  custoFretePorPedido: Map<number, number | null>;
};

// Teto de NOVAS resolucoes (pedidos ainda nao cacheados) por carregamento de
// pagina -- protege a primeira visita a um periodo grande contra timeout/
// rate-limit. Pedidos ja cacheados NAO contam nesse teto (leitura do banco e
// praticamente gratis) -- por isso o card fica mais completo a cada visita.
const TETO_NOVAS_BUSCAS_PADRAO = 300;

export async function getVendasPorEstadoComCache(
  supabase: ClienteSupabase,
  pedidosPorConta: Map<string, { id: number; dataCriacao: string }[]>,
  tokensPorConta: Map<string, string>,
  tetoNovasBuscas = TETO_NOVAS_BUSCAS_PADRAO
): Promise<ResultadoEstadoPeriodo> {
  const todosPedidos: { id: number; contaId: string; dataCriacao: string }[] = [];
  for (const [contaId, lista] of pedidosPorConta) {
    for (const p of lista) todosPedidos.push({ ...p, contaId });
  }
  const idsPeriodo = todosPedidos.map((p) => p.id);

  const cacheMap = new Map<number, { estado: string; cidade: string | null; custoFrete: number | null }>();
  for (let i = 0; i < idsPeriodo.length; i += 500) {
    const lote = idsPeriodo.slice(i, i + 500);
    if (lote.length === 0) continue;
    const { data } = await supabase
      .from("pedido_envio_cache")
      .select("pedido_id, estado, cidade, custo_frete")
      .in("pedido_id", lote);
    for (const row of data ?? []) {
      cacheMap.set(row.pedido_id, {
        estado: row.estado,
        cidade: row.cidade,
        custoFrete: row.custo_frete ?? null,
      });
    }
  }

  // Pedidos ainda nao cacheados (a ordem de chegada em todosPedidos ja
  // reflete a ordem passada pelo chamador -- em vendas/page.tsx, mais
  // recentes primeiro -- entao o slice abaixo prioriza os mais recentes).
  const naoCacheados = todosPedidos.filter((p) => !cacheMap.has(p.id));
  // 03/08/2026 (correcao bug "frete zerado" na Margem Bruta): pedidos cujo
  // ESTADO ja foi cacheado ANTES da coluna custo_frete existir (ou antes de
  // uma tentativa anterior falhar em obter o custo) ficavam com custo_frete
  // nulo PARA SEMPRE, porque esta funcao so verificava presenca no cache
  // (cacheMap.has) para decidir o que buscar de novo -- nunca revisitava um
  // pedido so porque faltava o frete. Isso fazia a Margem Bruta tratar
  // "frete nunca buscado" como "frete R$0,00" (ver bug de coercao em
  // margem.ts). Agora tambem re-buscamos pedidos que JA tem estado em cache
  // mas ainda estao com custo_frete nulo. Novos pedidos (sem nenhum dado)
  // tem prioridade sobre esse backlog de frete, para nao atrasar a
  // resolucao de estado usada por Vendas/Metricas.
  const somenteSemFrete = todosPedidos.filter((p) => {
    const cache = cacheMap.get(p.id);
    return !!cache && cache.custoFrete === null;
  });
  const paraBuscarAgora = [...naoCacheados, ...somenteSemFrete].slice(0, tetoNovasBuscas);

  const porContaParaBuscar = new Map<string, { id: number }[]>();
  for (const p of paraBuscarAgora) {
    if (!porContaParaBuscar.has(p.contaId)) porContaParaBuscar.set(p.contaId, []);
    porContaParaBuscar.get(p.contaId)!.push({ id: p.id });
  }

  const novosResolvidos: { pedidoId: number; contaId: string; estado: string; cidade: string | null; custoFrete: number | null }[] = [];
  await Promise.all(
    Array.from(porContaParaBuscar.entries()).map(async ([contaId, lista]) => {
      const token = tokensPorConta.get(contaId);
      if (!token) return;
      try {
        const resolvidos = await resolverEstadoPedidos(token, lista);
        for (const r of resolvidos) novosResolvidos.push({ ...r, contaId });
      } catch (err) {
        console.error(`Erro ao resolver estado de pedidos da conta ${contaId}:`, err);
      }
    })
  );

  if (novosResolvidos.length > 0) {
    // Usa todosPedidos (nao so naoCacheados) porque paraBuscarAgora agora
    // tambem inclui pedidos de somenteSemFrete, que ja estavam no cache
    // (so faltava o frete) -- precisamos da dataCriacao deles tambem para
    // o upsert abaixo.
    const dataPorPedido = new Map(todosPedidos.map((p) => [p.id, p.dataCriacao]));
    const linhas = novosResolvidos.map((r) => ({
      pedido_id: r.pedidoId,
      conta_id: r.contaId,
      estado: r.estado,
      cidade: r.cidade,
      custo_frete: r.custoFrete,
      data_pedido: (dataPorPedido.get(r.pedidoId) ?? "").slice(0, 10) || null,
    }));
    try {
      for (let i = 0; i < linhas.length; i += 200) {
        const lote = linhas.slice(i, i + 200);
        const { error } = await supabase.from("pedido_envio_cache").upsert(lote, { onConflict: "pedido_id" });
        if (error) console.error("Erro ao gravar cache de estado:", error);
      }
    } catch (err) {
      // Se a tabela ainda nao existir ou o upsert falhar por qualquer
      // motivo, nao derruba a pagina -- so nao acumula cache desta vez.
      console.error("Erro ao gravar cache de estado (pedido_envio_cache):", err);
    }
    for (const r of novosResolvidos) cacheMap.set(r.pedidoId, { estado: r.estado, cidade: r.cidade, custoFrete: r.custoFrete });
  }

  const mapaEstado = new Map<string, number>();
  let totalResolvidos = 0;
  const estadoPorPedido = new Map<number, string>();
  const custoFretePorPedido = new Map<number, number | null>();
  for (const p of todosPedidos) {
    const resolvido = cacheMap.get(p.id);
    if (resolvido) {
      mapaEstado.set(resolvido.estado, (mapaEstado.get(resolvido.estado) ?? 0) + 1);
      totalResolvidos++;
      estadoPorPedido.set(p.id, resolvido.estado);
      custoFretePorPedido.set(p.id, resolvido.custoFrete);
    }
  }

  const porEstado = Array.from(mapaEstado.entries())
    .map(([estado, quantidade]) => ({ estado, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 10);

  return {
    porEstado,
    totalResolvidos,
    totalPeriodo: todosPedidos.length,
    amostraParcial: naoCacheados.length > tetoNovasBuscas,
    estadoPorPedido,
    custoFretePorPedido,
  };
}

// --- Historico: le direto do cache, sem NENHUMA chamada a API do ML ---

export type PontoEstadoHistorico = { estado: string; quantidade: number };
export type PontoMesEstado = { mes: string; porEstado: PontoEstadoHistorico[]; total: number };

export async function getHistoricoPorEstado(supabase: ClienteSupabase): Promise<{
  acumulado: PontoEstadoHistorico[];
  porMes: PontoMesEstado[];
  totalPedidosCacheados: number;
}> {
  const { data } = await supabase
    .from("pedido_envio_cache")
    .select("estado, data_pedido")
    .not("estado", "is", null);

  const linhas = (data ?? []) as { estado: string; data_pedido: string | null }[];

  const acumuladoMapa = new Map<string, number>();
  const porMesMapa = new Map<string, Map<string, number>>();

  for (const l of linhas) {
    acumuladoMapa.set(l.estado, (acumuladoMapa.get(l.estado) ?? 0) + 1);
    const mes = l.data_pedido ? l.data_pedido.slice(0, 7) : "sem-data";
    if (mes === "sem-data") continue;
    if (!porMesMapa.has(mes)) porMesMapa.set(mes, new Map());
    const mapaEstadoMes = porMesMapa.get(mes)!;
    mapaEstadoMes.set(l.estado, (mapaEstadoMes.get(l.estado) ?? 0) + 1);
  }

  const acumulado = Array.from(acumuladoMapa.entries())
    .map(([estado, quantidade]) => ({ estado, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);

  const porMes = Array.from(porMesMapa.entries())
    .map(([mes, mapa]) => ({
      mes,
      porEstado: Array.from(mapa.entries())
        .map(([estado, quantidade]) => ({ estado, quantidade }))
        .sort((a, b) => b.quantidade - a.quantidade),
      total: Array.from(mapa.values()).reduce((s, v) => s + v, 0),
    }))
    .sort((a, b) => b.mes.localeCompare(a.mes));

  return { acumulado, porMes, totalPedidosCacheados: linhas.length };
}
