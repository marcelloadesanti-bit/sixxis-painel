// Funcoes de acesso a API de Itens (Anuncios) do Mercado Livre.

import { getProdutosMaisVendidos, periodoDeDatas, type ProdutoRanking } from "@/lib/mercadolivre/orders";

export type AnuncioResumo = {
  id: string;
  titulo: string;
  thumbnail: string;
  preco: number;
  moeda: string;
  estoqueDisponivel: number;
  estoqueInicial: number;
  vendidosTotal: number; // vendas desde a criacao do anuncio (item.sold_quantity, vitalicio)
  vendidosPeriodo: number; // vendas dentro do periodo selecionado no filtro
  status: string;
  saude: number | null; // 0 a 1
  permalink: string;
  dataInicio: string;
  dataAtualizacao: string;
  catalogoAtivo: boolean;
  visitasPeriodo: number | null;
  conversao: number | null; // % vendas/visitas no periodo selecionado
  precoParaGanhar: StatusCatalogo | null;
};

export type StatusCatalogo = {
  status: string; // "not_listed" | "listed" | ...
  motivo: string[] | null;
};

export type AnuncioDetalhe = AnuncioResumo & {
  descricao: string;
  frete: {
    modo: string;
    freteGratis: boolean;
    tipoLogistico: string | null;
  };
  atributos: { id: string; nome: string; valor: string | null }[];
  variacoes: {
    id: number;
    preco: number;
    estoqueDisponivel: number;
    vendidos: number;
    sku: string | null;
    combinacoes: string;
  }[];
  categoriaId: string;
};

const SORT_MAP: Record<string, string> = {
  criados_recente: "start_time_desc",
  modificados_recente: "last_updated_desc",
  mais_vendidos: "last_updated_desc", // busca normal; reordenamos por vendas do periodo depois
  mais_vendidos_total: "sold_quantity_desc", // ordenacao nativa ja e por vendas desde a criacao
  mais_visualizados: "last_updated_desc", // busca normal; reordenamos por visitas depois
  maior_conversao: "last_updated_desc", // busca normal; reordenamos por conversao (vendas/visitas) depois
  melhor_qualidade: "last_updated_desc", // busca normal; reordenamos por saude (item.health) depois
};

export type OrdenacaoAnuncios = keyof typeof SORT_MAP;

// Busca ids de anuncios ativos de uma conta, usando a ordenacao nativa do ML
// quando disponivel. Busca ate `maxItens` (paginando de 50 em 50).
async function buscarIdsConta(
  accessToken: string,
  sellerId: string,
  ordenacao: OrdenacaoAnuncios,
  maxItens = 200
): Promise<string[]> {
  const ids: string[] = [];
  const limit = 50;
  let offset = 0;
  const sort = SORT_MAP[ordenacao];

  while (ids.length < maxItens) {
    const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?status=active&sort=${sort}&limit=${limit}&offset=${offset}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) break;
    const data = await resp.json();
    const pagina: string[] = data.results ?? [];
    ids.push(...pagina);
    if (pagina.length < limit) break;
    offset += limit;
  }

  return ids.slice(0, maxItens);
}

// Busca detalhe "bulk" de varios itens de uma vez (endpoint aceita ate ~20 ids por chamada).
// Exportada (Fase 5) para reuso em getMaisVendidosPorSku -- mesmo endpoint
// publico, so muda o que fazemos com o resultado.
export async function buscarItensBulk(accessToken: string, ids: string[]): Promise<any[]> {
  const itens: any[] = [];
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    const url = `https://api.mercadolibre.com/items?ids=${lote.join(",")}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) continue;
    const data = await resp.json();
    for (const entrada of data) {
      if (entrada.code === 200 && entrada.body) itens.push(entrada.body);
    }
  }
  return itens;
}

function mapearAnuncio(item: any): AnuncioResumo {
  return {
    id: item.id,
    titulo: item.title,
    thumbnail: item.thumbnail?.replace("http://", "https://") ?? "",
    preco: item.price,
    moeda: item.currency_id,
    estoqueDisponivel: item.available_quantity,
    estoqueInicial: item.initial_quantity,
    vendidosTotal: item.sold_quantity,
    vendidosPeriodo: 0,
    status: item.status,
    saude: typeof item.health === "number" ? item.health : null,
    permalink: item.permalink,
    dataInicio: item.date_created,
    dataAtualizacao: item.last_updated,
    catalogoAtivo: Boolean(item.catalog_listing),
    visitasPeriodo: null,
    conversao: null,
    precoParaGanhar: null,
  };
}

// Busca visitas no periodo selecionado (de/ate) de uma lista de anuncios,
// em paralelo com concorrencia limitada para nao estourar rate-limit da API.
async function buscarVisitas(
  accessToken: string,
  ids: string[],
  de: string,
  ate: string,
  concorrencia = 8
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  const dias = Math.min(
    150,
    Math.max(1, Math.round((new Date(ate + "T00:00:00").getTime() - new Date(de + "T00:00:00").getTime()) / 86400000) + 1)
  );

  for (let i = 0; i < ids.length; i += concorrencia) {
    const lote = ids.slice(i, i + concorrencia);
    const resultados = await Promise.all(
      lote.map(async (id) => {
        try {
          const url = `https://api.mercadolibre.com/items/${id}/visits/time_window?last=${dias}&unit=day&ending=${ate}`;
          const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!resp.ok) return [id, 0] as const;
          const data = await resp.json();
          return [id, data.total_visits ?? 0] as const;
        } catch {
          return [id, 0] as const;
        }
      })
    );
    for (const [id, total] of resultados) mapa.set(id, total);
  }

  return mapa;
}

// Busca status de "ganhando/perdendo" no catalogo para uma lista de anuncios.
async function buscarPrecoParaGanhar(
  accessToken: string,
  ids: string[],
  concorrencia = 8
): Promise<Map<string, StatusCatalogo>> {
  const mapa = new Map<string, StatusCatalogo>();

  for (let i = 0; i < ids.length; i += concorrencia) {
    const lote = ids.slice(i, i + concorrencia);
    const resultados = await Promise.all(
      lote.map(async (id) => {
        try {
          const url = `https://api.mercadolibre.com/items/${id}/price_to_win?version=v2`;
          const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!resp.ok) return [id, null] as const;
          const data = await resp.json();
          return [id, { status: data.status, motivo: data.reason ?? null }] as const;
        } catch {
          return [id, null] as const;
        }
      })
    );
    for (const [id, status] of resultados) {
      if (status) mapa.set(id, status);
    }
  }

  return mapa;
}

export type ContaParaAnuncios = { id: string; ml_user_id: string; nickname: string; cor: string };

export type LinhaAnuncio = AnuncioResumo & { contaId: string; contaNickname: string; contaCor: string };

// Funcao principal do Resumo de Anuncios: busca, mescla, ordena e enriquece
// (visitas + status de catalogo) apenas a pagina atual, para manter o custo
// de chamadas a API controlado.
export async function listarAnunciosResumo(
  contas: { conta: ContaParaAnuncios; accessToken: string }[],
  ordenacao: OrdenacaoAnuncios,
  pagina: number,
  periodo: { de: string; ate: string },
  porPagina = 25
): Promise<{ linhas: LinhaAnuncio[]; total: number }> {
  // 1. ids ordenados por conta (nativo do ML)
  const idsPorConta = await Promise.all(
    contas.map(async ({ conta, accessToken }) => ({
      conta,
      ids: await buscarIdsConta(accessToken, conta.ml_user_id, ordenacao),
    }))
  );

  const totalEstimado = idsPorConta.reduce((s, c) => s + c.ids.length, 0);

  // 2. bulk detail de todos os ids coletados
  const todasLinhas: LinhaAnuncio[] = [];
  for (const { conta, ids } of idsPorConta) {
    const accessToken = contas.find((c) => c.conta.id === conta.id)!.accessToken;
    const itens = await buscarItensBulk(accessToken, ids);
    for (const item of itens) {
      todasLinhas.push({
        ...mapearAnuncio(item),
        contaId: conta.id,
        contaNickname: conta.nickname,
        contaCor: conta.cor,
      });
    }
  }

  // 2.5 vendas do periodo selecionado, por conta (pedidos pagos no intervalo).
  // Buscado sempre (independente da ordenacao) pois alimenta tanto a coluna
  // "Vendidos (periodo)" quanto a Conversao, e tambem o ranking quando
  // ordenacao === "mais_vendidos" (vendas do periodo, nao vitalicio).
  const periodoVendas = periodoDeDatas(periodo.de, periodo.ate);
  const vendasPorContaPeriodo = new Map<string, Map<string, number>>();
  await Promise.all(
    contas.map(async ({ conta, accessToken }) => {
      try {
        const lista = await getProdutosMaisVendidos(accessToken, Number(conta.ml_user_id), periodoVendas);
        vendasPorContaPeriodo.set(conta.id, new Map(lista.map((p) => [p.itemId, p.quantidade])));
      } catch (err) {
        console.error(`Erro ao buscar vendas do periodo da conta ${conta.id}:`, err);
        vendasPorContaPeriodo.set(conta.id, new Map());
      }
    })
  );
  for (const linha of todasLinhas) {
    linha.vendidosPeriodo = vendasPorContaPeriodo.get(linha.contaId)?.get(linha.id) ?? 0;
  }

  // 3. ordenacao final (merge de contas + casos especiais que exigem o
  // conjunto completo de candidatos antes de paginar)
  let ordenadas = todasLinhas;

  if (ordenacao === "mais_vendidos") {
    // vendas dentro do periodo selecionado (nao vitalicio)
    ordenadas = [...todasLinhas].sort((a, b) => b.vendidosPeriodo - a.vendidosPeriodo);
  } else if (ordenacao === "mais_vendidos_total") {
    // vendas desde a criacao do anuncio (vitalicio, ignora o periodo do filtro)
    ordenadas = [...todasLinhas].sort((a, b) => b.vendidosTotal - a.vendidosTotal);
  } else if (ordenacao === "criados_recente") {
    ordenadas = [...todasLinhas].sort(
      (a, b) => new Date(b.dataInicio).getTime() - new Date(a.dataInicio).getTime()
    );
  } else if (ordenacao === "modificados_recente") {
    ordenadas = [...todasLinhas].sort(
      (a, b) => new Date(b.dataAtualizacao).getTime() - new Date(a.dataAtualizacao).getTime()
    );
  } else if (ordenacao === "melhor_qualidade") {
    // saude (item.health) ja vem no bulk de itens, sem custo extra de API.
    // Anuncios sem saude calculada (null) ficam por ultimo.
    ordenadas = [...todasLinhas].sort((a, b) => (b.saude ?? -1) - (a.saude ?? -1));
  }

  if (ordenacao === "mais_visualizados" || ordenacao === "maior_conversao") {
    // precisa de visitas de todo o conjunto coletado para poder ordenar direito
    const visitasPorLinha = new Map<string, number>();
    for (const conta of contas) {
      const idsDaConta = todasLinhas.filter((l) => l.contaId === conta.conta.id).map((l) => l.id);
      const visitas = await buscarVisitas(conta.accessToken, idsDaConta, periodo.de, periodo.ate);
      for (const [id, total] of visitas) visitasPorLinha.set(id, total);
    }
    for (const linha of todasLinhas) linha.visitasPeriodo = visitasPorLinha.get(linha.id) ?? 0;

    if (ordenacao === "mais_visualizados") {
      ordenadas = [...todasLinhas].sort(
        (a, b) => (visitasPorLinha.get(b.id) ?? 0) - (visitasPorLinha.get(a.id) ?? 0)
      );
    } else {
      // maior_conversao: vendas do periodo / visitas do periodo (mesma regra
      // usada depois para exibir a coluna Conversao).
      const conversaoDe = (l: LinhaAnuncio) => {
        const visitas = visitasPorLinha.get(l.id) ?? 0;
        if (visitas > 0) return l.vendidosPeriodo / visitas;
        return l.vendidosPeriodo > 0 ? 1 : 0;
      };
      ordenadas = [...todasLinhas].sort((a, b) => conversaoDe(b) - conversaoDe(a));
    }
  }

  // 4. pagina
  const inicio = (pagina - 1) * porPagina;
  const linhasPagina = ordenadas.slice(inicio, inicio + porPagina);

  // 5. enriquece so a pagina atual com visitas (se ainda nao calculadas) + status de catalogo
  const porConta = new Map(contas.map((c) => [c.conta.id, c.accessToken]));
  const idsPorContaPagina = new Map<string, string[]>();
  for (const linha of linhasPagina) {
    if (!idsPorContaPagina.has(linha.contaId)) idsPorContaPagina.set(linha.contaId, []);
    idsPorContaPagina.get(linha.contaId)!.push(linha.id);
  }

  for (const [contaId, ids] of idsPorContaPagina) {
    const accessToken = porConta.get(contaId)!;
    const [visitas, precoParaGanhar] = await Promise.all([
      ordenacao === "mais_visualizados" || ordenacao === "maior_conversao"
        ? Promise.resolve(new Map<string, number>())
        : buscarVisitas(accessToken, ids, periodo.de, periodo.ate),
      buscarPrecoParaGanhar(accessToken, ids),
    ]);

    for (const linha of linhasPagina) {
      if (linha.contaId !== contaId) continue;
      if (visitas.has(linha.id)) linha.visitasPeriodo = visitas.get(linha.id) ?? 0;
      if (precoParaGanhar.has(linha.id)) linha.precoParaGanhar = precoParaGanhar.get(linha.id)!;
      if (linha.visitasPeriodo && linha.visitasPeriodo > 0) {
        linha.conversao = Math.round((linha.vendidosPeriodo / linha.visitasPeriodo) * 1000) / 10;
      } else {
        linha.conversao = linha.vendidosPeriodo > 0 ? 100 : 0;
      }
    }
  }

  return { linhas: linhasPagina, total: totalEstimado };
}

export async function getAnuncioDetalhe(accessToken: string, itemId: string): Promise<AnuncioDetalhe | null> {
  const [itemResp, descResp] = await Promise.all([
    fetch(`https://api.mercadolibre.com/items/${itemId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
    fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }),
  ]);

  if (!itemResp.ok) return null;
  const item = await itemResp.json();
  const desc = descResp.ok ? await descResp.json().catch(() => null) : null;

  const base = mapearAnuncio(item);

  return {
    ...base,
    descricao: desc?.plain_text ?? "",
    frete: {
      modo: item.shipping?.mode ?? "",
      freteGratis: Boolean(item.shipping?.free_shipping),
      tipoLogistico: item.shipping?.logistic_type ?? null,
    },
    atributos: (item.attributes ?? []).map((a: any) => ({
      id: a.id,
      nome: a.name,
      valor: a.value_name,
    })),
    variacoes: (item.variations ?? []).map((v: any) => ({
      id: v.id,
      preco: v.price,
      estoqueDisponivel: v.available_quantity,
      vendidos: v.sold_quantity,
      sku: v.attributes?.find((a: any) => a.id === "SELLER_SKU")?.value_name ?? v.seller_custom_field ?? null,
      combinacoes: (v.attribute_combinations ?? []).map((c: any) => c.value_name).join(" / "),
    })),
    categoriaId: item.category_id,
  };
}

// --- Fase 5: mais vendidos por SKU (nao por anuncio) ---

export type RankingSku = { sku: string; titulo: string; quantidade: number; valor: number };

// Agrupa um ranking de produtos (por item/anuncio, vindo de getVendas ou
// getProdutosMaisVendidos, ja mesclado entre contas) por SKU -- ja que o
// mesmo SKU pode estar publicado em anuncios/contas diferentes. Busca o SKU
// de cada item via o bulk de itens (mesmo endpoint publico ja usado acima),
// limitado ao numero de itens distintos vendidos no periodo -- catalogo
// pequeno (poucos produtos/variacoes), custo baixo mesmo somando essa
// chamada extra.
export async function getMaisVendidosPorSku(
  accessToken: string,
  ranking: ProdutoRanking[]
): Promise<RankingSku[]> {
  const ids = ranking.map((r) => r.itemId).filter((id) => id !== "sem-id");
  if (ids.length === 0) return [];

  // Fase 5 (correcao pos-verificacao ao vivo): o endpoint multiget
  // (/items?ids=...) nao retornou de forma confiavel o campo de SKU
  // (seller_custom_field / atributo SELLER_SKU) mesmo autenticado -- todos os
  // itens apareciam como "(sem SKU)" no ranking, enquanto a pagina de
  // detalhe do anuncio (que usa /items/{id} individual) mostrava o SKU
  // corretamente na Ficha tecnica. Como o catalogo e pequeno (poucos
  // produtos/variacoes), buscamos cada item individualmente em paralelo
  // (mesma chamada ja usada em getAnuncioDetalhe) em vez do lote, o que
  // garante que o SKU volte certo. Tambem verifica o SKU por variacao
  // (cor/modelo), caso o anuncio nao tenha SKU no nivel principal.
  const skuPorId = new Map<string, string>();
  await Promise.all(
    ids.map(async (id) => {
      try {
        const resp = await fetch(`https://api.mercadolibre.com/items/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!resp.ok) return;
        const item = await resp.json();
        const skuItem: string | null =
          item.seller_custom_field ??
          item.attributes?.find((a: any) => a.id === "SELLER_SKU")?.value_name ??
          null;
        if (skuItem) {
          skuPorId.set(id, skuItem);
          return;
        }
        const variacaoComSku = (item.variations ?? []).find(
          (v: any) => v.seller_custom_field || v.attributes?.some((a: any) => a.id === "SELLER_SKU")
        );
        if (variacaoComSku) {
          const skuVar: string | null =
            variacaoComSku.seller_custom_field ??
            variacaoComSku.attributes?.find((a: any) => a.id === "SELLER_SKU")?.value_name ??
            null;
          if (skuVar) skuPorId.set(id, skuVar);
        }
      } catch {
        // ignora -- item entra como "(sem SKU)" no agrupamento abaixo
      }
    })
  );

  const porSku = new Map<string, RankingSku>();
  for (const r of ranking) {
    // Quando o anuncio nao tem SKU cadastrado, usa o proprio titulo como
    // chave (nao agrupa com nada, mas tambem nao some da lista).
    const sku = skuPorId.get(r.itemId) ?? `(sem SKU) ${r.titulo}`;
    const atual = porSku.get(sku);
    if (atual) {
      atual.quantidade += r.quantidade;
      atual.valor += r.valor;
    } else {
      porSku.set(sku, { sku, titulo: r.titulo, quantidade: r.quantidade, valor: r.valor });
    }
  }

  return Array.from(porSku.values()).sort((a, b) => b.quantidade - a.quantidade);
}
