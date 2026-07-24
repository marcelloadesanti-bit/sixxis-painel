// Funcoes de acesso a API de Categorias e Criacao de Itens do Mercado Livre.
// Observacao importante (descoberta em pesquisa ao vivo): os endpoints de
// categoria (arvore e atributos), apesar de serem dados "publicos" de
// referencia, sao bloqueados pela politica da API do ML quando chamados sem
// um Authorization Bearer valido (retornam 403 PA_UNAUTHORIZED_RESULT_FROM_POLICIES).
// Por isso, todas as funcoes abaixo exigem um accessToken, mesmo as de leitura.

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
  dica: string | null;
  valores: { id: string; nome: string }[] | null; // presente quando tipo = "list"
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

// Atributos preenchiveis de uma categoria folha, filtrando os que sao
// ocultos/somente-leitura (esses o ML preenche sozinho ou nao se aplicam a
// um cadastro manual) e mantendo apenas os obrigatorios + relevantes.
export async function buscarAtributosCategoria(
  accessToken: string,
  categoriaId: string
): Promise<AtributoCategoria[]> {
  const dados = await chamarML<any[]>(
    `https://api.mercadolibre.com/categories/${categoriaId}/attributes`,
    accessToken
  );
  return dados
    .filter((a) => a.tags?.required && !a.tags?.hidden && !a.tags?.read_only)
    .map((a) => ({
      id: a.id,
      nome: a.name,
      tipo: a.value_type,
      obrigatorio: Boolean(a.tags?.required),
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

// Envia uma imagem (bytes) para a biblioteca de imagens da conta e retorna o
// id da imagem, usado depois no campo `pictures` da criacao do item.
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

export type NovoItemPayload = {
  titulo: string;
  categoriaId: string;
  preco: number;
  estoque: number;
  moeda: string;
  descricao: string;
  fotosIds: string[];
  atributos: { id: string; value_name?: string; value_id?: string }[];
  freteGratis: boolean;
};

// Cria o anuncio em si (sem a descricao, que e um endpoint separado) e, em
// seguida, define a descricao. Retorna o id do item criado no Mercado Livre.
export async function criarItemML(accessToken: string, payload: NovoItemPayload): Promise<string> {
  const corpoItem = {
    title: payload.titulo,
    category_id: payload.categoriaId,
    price: payload.preco,
    currency_id: payload.moeda,
    available_quantity: payload.estoque,
    buying_mode: "buy_it_now",
    listing_type_id: "gold_special",
    condition: "new",
    pictures: payload.fotosIds.map((id) => ({ id })),
    attributes: payload.atributos,
    shipping: {
      mode: "me2",
      free_shipping: payload.freteGratis,
    },
  };

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
