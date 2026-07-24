// Funcoes de acesso a API de Categorias e Criacao de Itens do Mercado Livre.
// Observacao importante (descoberta em pesquisa ao vivo): os endpoints de
// categoria (arvore e atributos), apesar de serem dados "publicos" de
// referencia, sao bloqueados pela politica da API do ML quando chamados sem
// um Authorization Bearer valido (retornam 403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES).
// Por isso, todas as funcoes abaixo exigem um accessToken, mesmo as de leitura.
//
// v2 (reconstrucao apos teste ao vivo do usuario): o formulario v1 so
// enviava os atributos OBRIGATORIOS da categoria, o que gerava anuncios
// incompletos perto do que a propria plataforma do ML cria (faltava ficha
// tecnica/especificacoes opcionais, variacoes, SKU/GTIN, tipo de anuncio
// classico/premium). Este arquivo passou a expor tambem os atributos
// opcionais (agrupados como "ficha tecnica"), os atributos que aceitam
// variacao, e os tipos de anuncio disponiveis com a tarifa estimada de cada
// um -- replicando o fluxo real de criacao (mercadolivre.com.br > Vender >
// Anunciar), mapeado em pesquisa ao vivo antes desta reconstrucao.

export type CategoriaResumo = { id: string; name: string; totalItens?: number };

export type CategoriaDetalhe = {
  id: string;
  nome: string;
  caminho: { id: string; nome: string }[];
  filhas: CategoriaResumo[];
  ehFolha: boolean;
  permiteAnunciar: boolean;
  condicoesAceitas: string[];
  tituloMaxLength: number;
  maxFotos: number;
};

export type AtributoCategoria = {
  id: string;
  nome: string;
  tipo: string; // value_type do ML: string | number | number_unit | list | boolean...
  obrigatorio: boolean;
  // "principal" = obrigatorio (equivalente a Marca/Modelo/etc no fluxo real);
  // "secundaria" = opcional, faz parte da ficha tecnica/especificacoes.
  grupo: "principal" | "secundaria";
  podeVariar: boolean; // tags.allow_variations -- pode virar dimensao de variacao (cor, voltagem...)
  embalagem: boolean; // SELLER_PACKAGE_* -- medidas/peso da embalagem, usadas no calculo de frete
  dica: string | null;
  valores: { id: string; nome: string }[] | null; // presente quando tipo = "list" ou "boolean"
};

// Atributos que ja tem campo dedicado proprio no formulario (SKU, GTIN) ou
// que sao irrelevantes/redundantes para o vendedor preencher manualmente
// (id interno, motivo de GTIN vazio, condicao do item que ja e um campo
// proprio do anuncio, etc). Ficam de fora da lista generica de
// caracteristicas para nao duplicar/confundir.
const ATRIBUTOS_EXCLUIDOS = new Set([
  "GTIN",
  "SELLER_SKU",
  "ITEM_CONDITION",
  "PRODUCT_DATA_SOURCE",
  "EMPTY_GTIN_REASON",
  "AGID",
]);

export type TipoAnuncio = {
  id: string; // listing_type_id, ex: "gold_special", "gold_pro"
  nome: string; // "Clássica", "Premium"...
  tarifaVenda: number; // sale_fee_amount estimado para o preco consultado
  tarifaListagem: number; // listing_fee_amount
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

// Raiz da arvore de categorias do site Brasil.
export async function buscarCategoriasRaiz(accessToken: string): Promise<CategoriaResumo[]> {
  const dados = await chamarML<{ id: string; name: string }[]>(
    "https://api.mercadolibre.com/sites/MLB/categories",
    accessToken
  );
  return dados.map((c) => ({ id: c.id, name: c.name }));
}

// Detalhe de uma categoria: filhas (se houver), se e folha, e as regras
// basicas de publicacao (condicao aceita, tamanho maximo de titulo, fotos).
export async function buscarCategoria(accessToken: string, categoriaId: string): Promise<CategoriaDetalhe> {
  const dados = await chamarML<any>(`https://api.mercadolibre.com/categories/${categoriaId}`, accessToken);
  const filhas: CategoriaResumo[] = (dados.children_categories ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    totalItens: c.total_items_in_this_category,
  }));
  return {
    id: dados.id,
    nome: dados.name,
    caminho: (dados.path_from_root ?? []).map((p: any) => ({ id: p.id, nome: p.name })),
    filhas,
    ehFolha: filhas.length === 0,
    permiteAnunciar: dados.settings?.listing_allowed !== false,
    condicoesAceitas: dados.settings?.item_conditions ?? ["new"],
    tituloMaxLength: dados.settings?.max_title_length ?? 60,
    maxFotos: dados.settings?.max_pictures_per_item ?? 10,
  };
}

// Atributos de uma categoria folha, ja separados em "principal" (obrigatorio)
// e "secundaria" (ficha tecnica/especificacoes opcionais) -- espelhando as
// duas secoes que a propria plataforma do ML mostra na criacao de anuncio.
// So exclui os que sao ocultos/somente-leitura (o ML preenche sozinho ou nao
// se aplicam a um cadastro manual).
export async function buscarAtributosCategoria(
  accessToken: string,
  categoriaId: string
): Promise<AtributoCategoria[]> {
  const dados = await chamarML<any[]>(
    `https://api.mercadolibre.com/categories/${categoriaId}/attributes`,
    accessToken
  );
  // Importante (corrigido apos teste real): `tags.hidden` NAO significa
  // "o vendedor nao pode preencher" -- a propria plataforma do ML mostra a
  // maioria dos atributos "hidden" como ficha tecnica opcional na criacao
  // manual de anuncio (ex: "Com Bluetooth", "Material da estrutura", as
  // medidas de embalagem SELLER_PACKAGE_*). Quem realmente e preenchido
  // automaticamente pelo ML (e por isso deve ficar de fora) e o que tem
  // `tags.read_only`.
  return dados
    .filter((a) => !a.tags?.read_only && !ATRIBUTOS_EXCLUIDOS.has(a.id))
    .map((a) => ({
      id: a.id,
      nome: a.name,
      tipo: a.value_type,
      obrigatorio: Boolean(a.tags?.required),
      grupo: a.tags?.required ? "principal" : "secundaria",
      podeVariar: Boolean(a.tags?.allow_variations),
      embalagem: a.id.startsWith("SELLER_PACKAGE_"),
      dica: a.hint ?? a.tooltip ?? null,
      valores:
        a.value_type === "list" || a.value_type === "boolean"
          ? (a.values ?? []).map((v: any) => ({ id: v.id, nome: v.name }))
          : null,
    }));
}

export type SugestaoCategoria = { categoriaId: string; categoriaNome: string; dominioNome: string };

// Sugere a(s) categoria(s) mais provaveis a partir do titulo do anuncio,
// usando o mesmo mecanismo de previsao que a propria plataforma do ML usa
// ao criar um anuncio novo.
export async function buscarPredicaoCategoria(
  accessToken: string,
  titulo: string
): Promise<SugestaoCategoria[]> {
  const dados = await chamarML<any[]>(
    `https://api.mercadolibre.com/sites/MLB/domain_discovery/search?limit=5&q=${encodeURIComponent(titulo)}`,
    accessToken
  );
  return dados.map((d) => ({
    categoriaId: d.category_id,
    categoriaNome: d.category_name,
    dominioNome: d.domain_name,
  }));
}

// Tipos de anuncio disponiveis (Classico/Premium/etc) com a tarifa de venda
// estimada para o preco informado -- o mesmo comparativo que a plataforma
// mostra na etapa final antes de publicar. A tarifa real pode variar
// ligeiramente por conta (nivel de reputacao/MercadoLider), por isso e
// consultada com a conta de referencia e tratada como estimativa.
export async function buscarTiposAnuncio(
  accessToken: string,
  categoriaId: string,
  preco: number
): Promise<TipoAnuncio[]> {
  const dados = await chamarML<any[]>(
    `https://api.mercadolibre.com/sites/MLB/listing_prices?price=${preco}&category_id=${categoriaId}`,
    accessToken
  );
  return dados
    .filter((d) => d && d.listing_type_id && !d.error)
    // A API retorna todos os tipos existentes no site, mesmo os que nao se
    // aplicam a esta conta/categoria (aparecem com tarifa zerada). So
    // mostramos os que realmente tem custo calculado -- os mesmos que a
    // propria plataforma exibe como opcao real na tela de publicacao.
    .filter((d) => (d.sale_fee_amount ?? 0) > 0 || (d.listing_fee_amount ?? 0) > 0)
    .map((d) => ({
      id: d.listing_type_id,
      nome: d.listing_type_name ?? d.listing_type_id,
      tarifaVenda: d.sale_fee_amount ?? 0,
      tarifaListagem: d.listing_fee_amount ?? 0,
    }));
}

// Envia uma imagem (bytes) para a biblioteca de imagens da conta e retorna o
// id da imagem, usado depois no campo `pictures` da criacao do item. O id
// nao e compartilhavel entre contas -- precisa reenviar por conta.
export async function uploadImagemML(accessToken: string, arquivo: File): Promise<string> {
  const form = new FormData();
  form.append("file", arquivo, arquivo.name || "foto.jpg");

  const resp = await fetch("https://api.mercadolibre.com/pictures/items/upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const texto = await resp.text();
  let corpo: any = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {}

  if (!resp.ok) {
    const msg = corpo?.message ?? `Erro ${resp.status} ao enviar imagem.`;
    throw new Error(msg);
  }
  return corpo.id as string;
}

// Uma linha da matriz de variacoes (ex.: Cor = "Preto"): estoque, SKU e
// fotos sao especificos dessa combinacao, mas o preco e replicado do valor
// unico definido no formulario (decisao de produto: mesmo preco em todas as
// variacoes e contas, para manter o cadastro simples e consistente).
export type VariacaoPayload = {
  combinacao: { id: string; valorId?: string; valorNome?: string }[];
  estoque: number;
  sku?: string;
  gtin?: string;
  fotosIds: string[];
};

export type NovoItemPayload = {
  titulo: string;
  categoriaId: string;
  preco: number;
  moeda: string;
  descricao: string;
  atributos: { id: string; value_name?: string; value_id?: string }[];
  freteGratis: boolean;
  tipoAnuncio: string; // listing_type_id escolhido (classico/premium)
  // usado quando o anuncio NAO tem variacoes:
  estoque?: number;
  sku?: string;
  gtin?: string;
  fotosIds?: string[];
  // usado quando o anuncio TEM variacoes (substitui estoque/sku/gtin/fotosIds acima):
  variacoes?: VariacaoPayload[];
};

// Cria o anuncio em si (sem a descricao, que e um endpoint separado) e, em
// seguida, define a descricao. Retorna o id do item criado no Mercado Livre.
export async function criarItemML(accessToken: string, payload: NovoItemPayload): Promise<string> {
  const temVariacoes = Boolean(payload.variacoes && payload.variacoes.length > 0);

  const atributosItem = [...payload.atributos];
  if (!temVariacoes && payload.gtin) {
    atributosItem.push({ id: "GTIN", value_name: payload.gtin });
  }

  const corpoItem: Record<string, unknown> = {
    title: payload.titulo,
    category_id: payload.categoriaId,
    currency_id: payload.moeda,
    buying_mode: "buy_it_now",
    listing_type_id: payload.tipoAnuncio || "gold_special",
    condition: "new",
    attributes: atributosItem,
    shipping: {
      mode: "me2",
      free_shipping: payload.freteGratis,
    },
  };

  if (temVariacoes) {
    const fotosUnicas = Array.from(new Set(payload.variacoes!.flatMap((v) => v.fotosIds)));
    corpoItem.pictures = fotosUnicas.map((id) => ({ id }));
    corpoItem.variations = payload.variacoes!.map((v) => ({
      attribute_combinations: v.combinacao.map((c) => ({
        id: c.id,
        ...(c.valorId ? { value_id: c.valorId } : { value_name: c.valorNome }),
      })),
      attributes: v.gtin ? [{ id: "GTIN", value_name: v.gtin }] : [],
      available_quantity: v.estoque,
      price: payload.preco,
      seller_custom_field: v.sku || undefined,
      picture_ids: v.fotosIds,
    }));
  } else {
    corpoItem.price = payload.preco;
    corpoItem.available_quantity = payload.estoque ?? 0;
    corpoItem.pictures = (payload.fotosIds ?? []).map((id) => ({ id }));
    if (payload.sku) corpoItem.seller_custom_field = payload.sku;
  }

  const resp = await fetch("https://api.mercadolibre.com/items", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpoItem),
  });
  const texto = await resp.text();
  let corpo: any = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {}

  if (!resp.ok) {
    const msg =
      corpo?.cause?.map((c: any) => c.message).join(" | ") ?? corpo?.message ?? `Erro ${resp.status} ao criar anúncio.`;
    throw new Error(msg);
  }

  const itemId = corpo.id as string;

  if (payload.descricao) {
    await fetch(`https://api.mercadolibre.com/items/${itemId}/description`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ plain_text: payload.descricao }),
    }).catch(() => null); // nao falha a criacao inteira se so a descricao der erro
  }

  return itemId;
}
