// Funcoes de acesso as APIs OFICIAIS de inteligencia competitiva do Mercado
// Livre -- mesmo token OAuth que ja usamos em todo o painel, sem scraping e
// sem sessao de navegador.
//
// Contexto (ver discussao antes desta implementacao): o endpoint publico de
// busca geral (/sites/{site}/search) esta bloqueado (403) para o nosso app
// -- ML restringe a parceiros aprovados desde as mudancas anti-scraping.
// Testamos ao vivo e confirmamos 3 APIs alternativas, OFICIAIS, que cobrem a
// mesma necessidade sem depender desse endpoint:
//
// 1. /highlights/{site}/category/{category_id} -- top 20 mais vendidos de
//    uma categoria. E o mesmo motor por tras da aba "Analise de mercado" >
//    "Tendencias por categoria" do proprio site do Mercado Livre.
// 2. /products/{product_id} -- detalhe (nome, imagens, dominio) de um
//    PRODUCT do catalogo, de QUALQUER vendedor -- publico, nao exige posse
//    (diferente de /items/{id}, que so funciona para itens da propria
//    conta).
// 3. /suggestions/user/{user_id}/items + /suggestions/items/{item_id}/details
//    -- benchmark de preco oficial: pra cada anuncio nosso, o ML ja calcula
//    se nosso preco esta acima/na media/abaixo da concorrencia, com uma
//    amostra de itens comparaveis (titulo + preco + vendidos).

export type ComparavelBenchmark = {
  preco: number;
  titulo: string;
  vendidos: number;
};

export type BenchmarkItem = {
  itemId: string;
  status: string; // with_benchmark_highest | with_benchmark_high | no_benchmark_ok | no_benchmark_lowest | ...
  precoAtual: number;
  precoSugerido: number | null;
  precoMenor: number | null;
  diferencaPercentual: number | null;
  comparaveis: ComparavelBenchmark[];
  atualizadoEm: string | null;
};

export type TipoDestaque = "ITEM" | "PRODUCT" | "USER_PRODUCT";

export type ItemMaisVendido = {
  id: string;
  posicao: number;
  tipo: TipoDestaque;
  titulo: string | null;
  imagem: string | null;
};

export type CategoriaVendedor = {
  categoriaId: string;
  categoriaNome: string;
  quantidadeAnuncios: number;
};

async function chamarML<T>(url: string, accessToken: string): Promise<T | null> {
  try {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

// Lista os IDs dos itens de um vendedor que tem referencia de preco
// calculada pelo ML (nem todo item tem -- depende de haver concorrencia
// comparavel o suficiente).
export async function buscarItensComBenchmark(accessToken: string, mlUserId: string): Promise<string[]> {
  const dados = await chamarML<{ items: string[] }>(
    `https://api.mercadolibre.com/suggestions/user/${mlUserId}/items`,
    accessToken
  );
  return dados?.items ?? [];
}

// Detalhe do benchmark de preco de um item nosso.
export async function buscarBenchmarkItem(accessToken: string, itemId: string): Promise<BenchmarkItem | null> {
  const dados = await chamarML<any>(`https://api.mercadolibre.com/suggestions/items/${itemId}/details`, accessToken);
  if (!dados) return null;
  return {
    itemId,
    status: dados.status ?? "desconhecido",
    precoAtual: dados.current_price?.amount ?? 0,
    precoSugerido: dados.suggested_price?.amount ?? null,
    precoMenor: dados.lowest_price?.amount ?? null,
    diferencaPercentual: typeof dados.percent_difference === "number" ? dados.percent_difference : null,
    comparaveis: (dados.metadata?.graph ?? [])
      .map((g: any) => ({
        preco: g.price?.amount ?? 0,
        titulo: g.info?.title ?? "",
        vendidos: g.info?.sold_quantity ?? 0,
      }))
      .filter((c: ComparavelBenchmark) => c.titulo),
    atualizadoEm: dados.last_updated ?? null,
  };
}

// Busca o benchmark de ate `maxItens` anuncios de uma conta (os mais
// relevantes primeiro, na ordem devolvida pelo ML), com concorrencia
// limitada.
export async function buscarBenchmarksDaConta(
  accessToken: string,
  mlUserId: string,
  maxItens = 30
): Promise<BenchmarkItem[]> {
  const ids = (await buscarItensComBenchmark(accessToken, mlUserId)).slice(0, maxItens);
  const resultados: BenchmarkItem[] = [];
  const concorrencia = 6;
  for (let i = 0; i < ids.length; i += concorrencia) {
    const lote = ids.slice(i, i + concorrencia);
    const detalhes = await Promise.all(lote.map((id) => buscarBenchmarkItem(accessToken, id)));
    for (const d of detalhes) if (d) resultados.push(d);
  }
  return resultados;
}

// Top 20 mais vendidos de uma categoria -- dado oficial do ML, mesmo motor
// da aba "Analise de mercado" do proprio site do Mercado Livre. Enriquece
// apenas os itens do tipo PRODUCT (catalogo, publico) com nome/imagem --
// ITEM/USER_PRODUCT ficam so com o id, ja que os endpoints de detalhe deles
// exigem posse do anuncio.
export async function buscarMaisVendidosCategoria(
  accessToken: string,
  siteId: string,
  categoriaId: string
): Promise<ItemMaisVendido[]> {
  const dados = await chamarML<{ content: { id: string; position: number; type: string }[] }>(
    `https://api.mercadolibre.com/highlights/${siteId}/category/${categoriaId}`,
    accessToken
  );
  if (!dados) return [];

  const base: ItemMaisVendido[] = (dados.content ?? []).map((c) => ({
    id: c.id,
    posicao: c.position,
    tipo: (c.type as TipoDestaque) ?? "ITEM",
    titulo: null,
    imagem: null,
  }));

  const produtos = base.filter((b) => b.tipo === "PRODUCT");
  await Promise.all(
    produtos.map(async (p) => {
      const detalhe = await chamarML<{ name: string; pictures?: { url: string }[] }>(
        `https://api.mercadolibre.com/products/${p.id}`,
        accessToken
      );
      if (detalhe) {
        p.titulo = detalhe.name;
        p.imagem = detalhe.pictures?.[0]?.url ?? null;
      }
    })
  );

  return base;
}

// Categorias em que o vendedor tem anuncios ativos, com contagem -- usa o
// bloco de filtros do proprio endpoint de busca de itens (nao precisa
// carregar o detalhe de cada anuncio).
export async function buscarCategoriasVendedor(accessToken: string, mlUserId: string): Promise<CategoriaVendedor[]> {
  const dados = await chamarML<{ available_filters?: { id: string; values?: any[] }[] }>(
    `https://api.mercadolibre.com/users/${mlUserId}/items/search?status=active&include_filters=true&limit=1`,
    accessToken
  );
  const filtroCategoria = dados?.available_filters?.find((f) => f.id === "category");
  const valores = filtroCategoria?.values ?? [];
  return valores
    .map((v: any) => ({
      categoriaId: v.id,
      categoriaNome: v.name,
      quantidadeAnuncios: v.results ?? 0,
    }))
    .sort((a, b) => b.quantidadeAnuncios - a.quantidadeAnuncios);
}
