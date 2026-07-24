// Funcoes de acesso a API de Itens (Anuncios) do Mercado Livre.

export type AnuncioResumo = {
  id: string;
  titulo: string;
  thumbnail: string;
  preco: number;
  moeda: string;
  estoqueDisponivel: number;
  estoqueInicial: number;
  vendidos: number;
  status: string;
  saude: number | null; // 0 a 1
  permalink: string;
  dataInicio: string;
  dataAtualizacao: string;
  catalogoAtivo: boolean;
  visitas7dias: number | null;
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
  mais_vendidos: "sold_quantity_desc",
  mais_visualizados: "last_updated_desc", // busca normal; reordenamos por visitas depois
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
async function buscarItensBulk(accessToken: string, ids: string[]): Promise<any[]> {
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
    vendidos: item.sold_quantity,
    status: item.status,
    saude: typeof item.health === "number" ? item.health : null,
    permalink: item.permalink,
    dataInicio: item.date_created,
    dataAtualizacao: item.last_updated,
    catalogoAtivo: Boolean(item.catalog_listing),
    visitas7dias: null,
    precoParaGanhar: null,
  };
}

// Busca visitas (ultimos 7 dias) de uma lista de anuncios, em paralelo com
// concorrencia limitada para nao estourar rate-limit da API do ML.
async function buscarVisitas(
  accessToken: string,
  ids: string[],
  concorrencia = 8
): Promise<Map<string, number>> {
  const mapa = new Map<string, number>();
  const hoje = new Date().toISOString().slice(0, 10);

  for (let i = 0; i < ids.length; i += concorrencia) {
    const lote = ids.slice(i, i + concorrencia);
    const resultados = await Promise.all(
      lote.map(async (id) => {
        try {
          const url = `https://api.mercadolibre.com/items/${id}/visits/time_window?last=7&unit=day&ending=${hoje}`;
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

  // 3. ordenacao final (merge de contas + caso especial "mais visualizados")
  let ordenadas = todasLinhas;

  if (ordenacao === "mais_vendidos") {
    ordenadas = [...todasLinhas].sort((a, b) => b.vendidos - a.vendidos);
  } else if (ordenacao === "criados_recente") {
    ordenadas = [...todasLinhas].sort(
      (a, b) => new Date(b.dataInicio).getTime() - new Date(a.dataInicio).getTime()
    );
  } else if (ordenacao === "modificados_recente") {
    ordenadas = [...todasLinhas].sort(
      (a, b) => new Date(b.dataAtualizacao).getTime() - new Date(a.dataAtualizacao).getTime()
    );
  }

  if (ordenacao === "mais_visualizados") {
    // precisa de visitas de todo o conjunto coletado para poder ordenar direito
    const porConta = new Map(contas.map((c) => [c.conta.id, c.accessToken]));
    const visitasPorLinha = new Map<string, number>();
    for (const conta of contas) {
      const idsDaConta = todasLinhas.filter((l) => l.contaId === conta.conta.id).map((l) => l.id);
      const visitas = await buscarVisitas(conta.accessToken, idsDaConta);
      for (const [id, total] of visitas) visitasPorLinha.set(id, total);
    }
    ordenadas = [...todasLinhas].sort(
      (a, b) => (visitasPorLinha.get(b.id) ?? 0) - (visitasPorLinha.get(a.id) ?? 0)
    );
    for (const linha of ordenadas) linha.visitas7dias = visitasPorLinha.get(linha.id) ?? 0;
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
      ordenacao === "mais_visualizados" ? Promise.resolve(new Map<string, number>()) : buscarVisitas(accessToken, ids),
      buscarPrecoParaGanhar(accessToken, ids),
    ]);
    for (const linha of linhasPagina) {
      if (linha.contaId !== contaId) continue;
      if (visitas.has(linha.id)) linha.visitas7dias = visitas.get(linha.id) ?? 0;
      if (precoParaGanhar.has(linha.id)) linha.precoParaGanhar = precoParaGanhar.get(linha.id)!;
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
