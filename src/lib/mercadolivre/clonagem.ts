// Funcoes de clonagem de anuncios entre contas do Mercado Livre: busca o
// anuncio completo de uma conta (categoria, preco, atributos, variacoes,
// fotos) e recria em outra conta, sem reenviar bytes de imagem -- o
// Mercado Livre aceita "source" (URL) diretamente no payload de criacao do
// item (mesmo campo documentado para substituir fotos de um item existente:
// https://developers.mercadolibre.com.ar/en_us/working-with-pictures), entao
// usamos a propria URL publica das fotos do anuncio original.

import { buscarCategoria, buscarAtributosCategoria } from "@/lib/mercadolivre/categorias";

export type FotoClonagem = { source: string };

export type VariacaoClonagem = {
    id: number;
    combinacao: { id: string; nome: string; valorId?: string; valorNome?: string }[];
    estoque: number;
    sku: string | null;
    fotos: FotoClonagem[];
};

export type ItemParaClonagem = {
    id: string;
    titulo: string;
    categoriaId: string;
    categoriaNome: string;
    preco: number;
    moeda: string;
    descricao: string;
    freteGratis: boolean;
    tipoAnuncio: string;
    atributos: { id: string; value_name?: string; value_id?: string }[];
    temVariacoes: boolean;
    // true quando todas as variacoes combinam em um unico atributo -- unico
    // caso que o modo "editavel" consegue mostrar de forma simples (estoque
    // por linha); com mais de uma caracteristica o item so pode ser clonado no
    // modo "copia simples" (a estrutura e replicada como esta, sem tela de
    // edicao, ja que o formulario nao foi desenhado para variacoes cruzadas).
    variacaoAtributoUnico: boolean;
    estoque: number | null;
    sku: string | null;
    fotos: FotoClonagem[];
    variacoes: VariacaoClonagem[];
    thumbnail: string;
    permalink: string;
};

async function chamarML<T>(url: string, accessToken: string): Promise<T> {
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const texto = await resp.text();
    let corpo: any = null;
    try {
          corpo = texto ? JSON.parse(texto) : null;
    } catch {
          // resposta nao-JSON
    }
    if (!resp.ok) {
          const msg = corpo?.message ?? corpo?.error ?? `Erro ${resp.status} ao consultar o Mercado Livre.`;
          throw new Error(msg);
    }
    return corpo as T;
}

// Busca o anuncio completo (item + descricao + nome da categoria), pronto
// para ser clonado -- usado tanto pela previa do modo "editavel" quanto pela
// clonagem direta no modo "copia simples".
export async function buscarItemParaClonagem(accessToken: string, itemId: string): Promise<ItemParaClonagem> {
    const item = await chamarML<any>(`https://api.mercadolibre.com/items/${itemId}`, accessToken);

  const [descResp, categoria, atributosCategoria] = await Promise.all([
        fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
                headers: { Authorization: `Bearer ${accessToken}` },
        }),
        buscarCategoria(accessToken, item.category_id).catch(() => null),
        buscarAtributosCategoria(accessToken, item.category_id).catch(() => null),
      ]);
    const desc = descResp.ok ? await descResp.json().catch(() => null) : null;

  // So reenviamos atributos que a categoria ainda aceita preencher
  // manualmente (a mesma lista usada na criacao do zero) -- evita mandar de
  // volta campos read-only/computados pelo proprio Mercado Livre (ex.:
  // origem do dado de catalogo), que a API rejeitaria na criacao.
  const idsAtributosPermitidos = atributosCategoria ? new Set(atributosCategoria.map((a) => a.id)) : null;
    const atributosClonados = (item.attributes ?? [])
      .filter((a: any) => a.value_id || a.value_name)
      .filter((a: any) => !idsAtributosPermitidos || idsAtributosPermitidos.has(a.id))
      .map((a: any) => ({
              id: a.id,
              value_name: a.value_name ?? undefined,
              value_id: a.value_id ?? undefined,
      }));

  // mapa id da foto -> url segura, para resolver picture_ids das variacoes
  // (a API devolve so o id na variacao; a url fica na lista de fotos do item)
  const fotoPorId = new Map<string, string>();
    for (const p of item.pictures ?? []) {
          const url = (p.secure_url ?? p.url ?? "").replace("http://", "https://");
          if (url) fotoPorId.set(p.id, url);
    }

  const fotosItem: FotoClonagem[] = (item.pictures ?? [])
      .map((p: any) => ({ source: (p.secure_url ?? p.url ?? "").replace("http://", "https://") }))
      .filter((f: FotoClonagem) => f.source);

  const variacoesRaw: any[] = item.variations ?? [];
    const temVariacoes = variacoesRaw.length > 0;

  // conjunto de atributos de combinacao usados (para saber se e "atributo
  // unico", ex.: so Cor, ou multiplo, ex.: Cor + Tamanho)
  const atributosCombinacao = new Set<string>();
    for (const v of variacoesRaw) {
          for (const c of v.attribute_combinations ?? []) atributosCombinacao.add(c.id);
    }

  const variacoes: VariacaoClonagem[] = variacoesRaw.map((v: any) => ({
        id: v.id,
        combinacao: (v.attribute_combinations ?? []).map((c: any) => ({
                id: c.id,
                nome: c.name,
                valorId: c.value_id ?? undefined,
                valorNome: c.value_name ?? undefined,
        })),
        estoque: v.available_quantity ?? 0,
        sku: v.seller_custom_field ?? v.attributes?.find((a: any) => a.id === "SELLER_SKU")?.value_name ?? null,
        fotos: (v.picture_ids ?? [])
          .map((id: string) => fotoPorId.get(id))
          .filter((s: string | undefined): s is string => Boolean(s))
          .map((source: string) => ({ source })),
  }));

  return {
        id: item.id,
        titulo: item.title,
        categoriaId: item.category_id,
        categoriaNome: categoria?.nome ?? item.category_id,
        preco: item.price,
        moeda: item.currency_id,
        descricao: desc?.plain_text ?? "",
        freteGratis: Boolean(item.shipping?.free_shipping),
        tipoAnuncio: item.listing_type_id,
        atributos: atributosClonados,
        temVariacoes,
        variacaoAtributoUnico: atributosCombinacao.size <= 1,
        estoque: temVariacoes ? null : item.available_quantity ?? null,
        sku: temVariacoes
          ? null
                : item.seller_custom_field ?? item.attributes?.find((a: any) => a.id === "SELLER_SKU")?.value_name ?? null,
        fotos: fotosItem,
        variacoes,
        thumbnail: (item.thumbnail ?? "").replace("http://", "https://"),
        permalink: item.permalink,
  };
}

export type OverridesClonagem = {
    titulo?: string;
    preco?: number;
    descricao?: string;
    freteGratis?: boolean;
    tipoAnuncio?: string;
    estoque?: number; // para itens sem variacao
    estoquePorVariacao?: Record<number, number>; // variacao.id (original) -> novo estoque
};

// Recria o anuncio (dados de buscarItemParaClonagem) em outra conta, usando
// o proprio access token da conta de destino. As fotos sao enviadas por URL
// (campo "source"), sem precisar rebaixar/reenviar os bytes -- o Mercado
// Livre baixa a imagem diretamente da URL original ao processar a criacao.
export async function clonarItemML(
    accessTokenDestino: string,
    origem: ItemParaClonagem,
    overrides?: OverridesClonagem
  ): Promise<string> {
    const titulo = overrides?.titulo?.trim() || origem.titulo;
    const preco = overrides?.preco ?? origem.preco;
    const descricao = overrides?.descricao ?? origem.descricao;
    const freteGratis = overrides?.freteGratis ?? origem.freteGratis;
    const tipoAnuncio = overrides?.tipoAnuncio || origem.tipoAnuncio;

  const corpoItem: Record<string, unknown> = {
        title: titulo,
        category_id: origem.categoriaId,
        currency_id: origem.moeda,
        buying_mode: "buy_it_now",
        listing_type_id: tipoAnuncio || "gold_special",
        condition: "new",
        attributes: origem.atributos,
        shipping: { mode: "me2", free_shipping: freteGratis },
  };

  if (origem.temVariacoes) {
        corpoItem.pictures = origem.fotos.map((f) => ({ source: f.source }));
        corpoItem.variations = origem.variacoes.map((v) => ({
                attribute_combinations: v.combinacao.map((c) => ({
                          id: c.id,
                          ...(c.valorId ? { value_id: c.valorId } : { value_name: c.valorNome }),
                })),
                available_quantity: overrides?.estoquePorVariacao?.[v.id] ?? v.estoque,
                price: preco,
                seller_custom_field: v.sku || undefined,
                // O Mercado Livre aceita tanto ids de foto ja existentes quanto URLs
                // "source" cruas dentro de picture_ids (mesmo padrao documentado para
                // a reposicao de fotos de um item) -- aqui usamos sempre a URL, ja que
                // as fotos sao novas para a conta de destino.
                picture_ids: v.fotos.map((f) => f.source),
        }));
  } else {
        corpoItem.price = preco;
        corpoItem.available_quantity = overrides?.estoque ?? origem.estoque ?? 0;
        corpoItem.pictures = origem.fotos.map((f) => ({ source: f.source }));
        if (origem.sku) corpoItem.seller_custom_field = origem.sku;
  }

  const resp = await fetch("https://api.mercadolibre.com/items", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessTokenDestino}`, "Content-Type": "application/json" },
        body: JSON.stringify(corpoItem),
  });
    const texto = await resp.text();
    let corpo: any = null;
    try {
          corpo = texto ? JSON.parse(texto) : null;
    } catch {
          // resposta nao-JSON
    }

  if (!resp.ok) {
        const msg =
                corpo?.cause?.map((c: any) => c.message).join(" | ") ??
                corpo?.message ??
                `Erro ${resp.status} ao clonar anúncio.`;
        throw new Error(msg);
  }

  const itemId = corpo.id as string;

  if (descricao) {
        await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
                method: "POST",
                headers: { Authorization: `Bearer ${accessTokenDestino}`, "Content-Type": "application/json" },
                body: JSON.stringify({ plain_text: descricao }),
        }).catch(() => null); // nao falha a clonagem inteira se so a descricao der erro
  }

  return itemId;
}

// Lista leve de anuncios ativos de uma conta, para o seletor "escolher
// anuncio de origem" na tela de clonagem.
export type AnuncioPicker = { id: string; titulo: string; thumbnail: string; preco: number; moeda: string };

export async function listarAnunciosParaPicker(
    accessToken: string,
    sellerId: string,
    maxItens = 100
  ): Promise<AnuncioPicker[]> {
    const ids: string[] = [];
    let offset = 0;
    const limit = 50;
    while (ids.length < maxItens) {
          const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?status=active&sort=last_updated_desc&limit=${limit}&offset=${offset}`;
          const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!resp.ok) break;
          const data = await resp.json();
          const pagina: string[] = data.results ?? [];
          ids.push(...pagina);
          if (pagina.length < limit) break;
          offset += limit;
    }

  const idsLimitados = ids.slice(0, maxItens);
    const itens: AnuncioPicker[] = [];
    for (let i = 0; i < idsLimitados.length; i += 20) {
          const lote = idsLimitados.slice(i, i + 20);
          const resp = await fetch(`https://api.mercadolibre.com/items?ids=${lote.join(",")}`, {
                  headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (!resp.ok) continue;
          const data = await resp.json();
          for (const entrada of data) {
                  if (entrada.code === 200 && entrada.body) {
                            const it = entrada.body;
                            itens.push({
                                        id: it.id,
                                        titulo: it.title,
                                        thumbnail: (it.thumbnail ?? "").replace("http://", "https://"),
                                        preco: it.price,
                                        moeda: it.currency_id,
                            });
                  }
          }
    }
    return itens;
}
