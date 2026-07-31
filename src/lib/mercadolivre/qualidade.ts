// Central de Qualidade (Fase 11, 31/07/2026).
// Score OFICIAL do Mercado Livre (/item/{id}/performance, escala 0-100,
// com buckets/motivos/links de correcao) + status de disputa de catalogo
// (/items/{id}/price_to_win) -- nao inventamos formula propria, so
// consumimos e traduzimos o que o ML ja calcula.
//
// IMPORTANTE (rate-limit): a consulta a API NUNCA acontece em massa
// automaticamente. So roda sob demanda: botao individual "Consultar score"
// ou botao em lote "Verificar mais N" (sempre limitado a anuncios com
// status ATIVO -- pausados/finalizados sao filtrados antes de qualquer
// chamada e nunca contabilizados). O resultado fica cacheado
// permanentemente em anuncio_qualidade_cache (Supabase), mesmo padrao do
// pedido_envio_cache/faturamento_cache: cada consulta e definitiva ate ser
// refeita manualmente.

import { buscarItensBulk } from "@/lib/mercadolivre/items";

type ClienteSupabase = { from: (table: string) => any };

export type BucketQualidade = {
  key: string;
  status: string;
  score: number;
  title: string;
};

export type QualidadeAnuncio = {
  itemId: string;
  contaId: string;
  score: number | null;
  nivel: string | null;
  pendencias: BucketQualidade[];
  catalogoStatus: string | null;
  catalogoPriceToWin: number | null;
  catalogoMotivo: string | null;
  catalogoWinnerItemId: string | null;
  catalogoWinnerPrice: number | null;
  calculadoEm: string | null;
};

// --- Chamadas reais a API do ML (uma por vez, sob demanda) ---

async function buscarPerformance(accessToken: string, itemId: string): Promise<any | null> {
  try {
    const resp = await fetch(`https://api.mercadolibre.com/item/${itemId}/performance`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

async function buscarPriceToWin(accessToken: string, itemId: string): Promise<any | null> {
  try {
    const resp = await fetch(`https://api.mercadolibre.com/items/${itemId}/price_to_win?version=v2`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// So guarda o que ainda esta PENDENTE (o que falta corrigir) -- o que ja
// esta COMPLETED nao precisa aparecer na UI, poluiria a lista de "como
// melhorar".
function extrairPendencias(data: any): BucketQualidade[] {
  const pendencias: BucketQualidade[] = [];
  for (const bucket of data?.buckets ?? []) {
    for (const variavel of bucket.variables ?? []) {
      if (variavel.status === "COMPLETED") continue;
      pendencias.push({
        key: variavel.key,
        status: variavel.status,
        score: variavel.score,
        title: variavel.title,
      });
    }
  }
  return pendencias.sort((a, b) => a.score - b.score);
}

// Consulta ao vivo (performance + catalogo) de UM anuncio e grava no cache.
// Usada pelo botao individual e pelo lote "Verificar mais N".
export async function consultarQualidade(
  supabase: ClienteSupabase,
  accessToken: string,
  itemId: string,
  contaId: string
): Promise<QualidadeAnuncio> {
  const [performance, priceToWin] = await Promise.all([
    buscarPerformance(accessToken, itemId),
    buscarPriceToWin(accessToken, itemId),
  ]);

  const motivos: string[] | null = Array.isArray(priceToWin?.reason) ? priceToWin.reason : null;

  const resultado: QualidadeAnuncio = {
    itemId,
    contaId,
    score: typeof performance?.score === "number" ? performance.score : null,
    nivel: performance?.level_wording ?? performance?.level ?? null,
    pendencias: performance ? extrairPendencias(performance) : [],
    catalogoStatus: priceToWin?.status ?? null,
    catalogoPriceToWin: typeof priceToWin?.price_to_win === "number" ? priceToWin.price_to_win : null,
    catalogoMotivo: motivos && motivos.length > 0 ? motivos[0] : null,
    catalogoWinnerItemId: priceToWin?.winner?.item_id ?? null,
    catalogoWinnerPrice: typeof priceToWin?.winner?.price === "number" ? priceToWin.winner.price : null,
    calculadoEm: new Date().toISOString(),
  };

  try {
    await supabase.from("anuncio_qualidade_cache").upsert(
      {
        item_id: itemId,
        conta_id: contaId,
        score: resultado.score,
        nivel: resultado.nivel,
        buckets: resultado.pendencias,
        catalogo_status: resultado.catalogoStatus,
        catalogo_price_to_win: resultado.catalogoPriceToWin,
        catalogo_motivo: resultado.catalogoMotivo,
        catalogo_winner_item_id: resultado.catalogoWinnerItemId,
        catalogo_winner_price: resultado.catalogoWinnerPrice,
        calculado_em: resultado.calculadoEm,
      },
      { onConflict: "item_id" }
    );
  } catch (err) {
    console.error(`Erro ao gravar cache de qualidade do item ${itemId}:`, err);
  }

  return resultado;
}

// --- Leitura do cache (zero chamadas a API do ML) ---

function linhaParaQualidade(row: any): QualidadeAnuncio {
  return {
    itemId: row.item_id,
    contaId: row.conta_id,
    score: row.score,
    nivel: row.nivel,
    pendencias: row.buckets ?? [],
    catalogoStatus: row.catalogo_status,
    catalogoPriceToWin: row.catalogo_price_to_win,
    catalogoMotivo: row.catalogo_motivo,
    catalogoWinnerItemId: row.catalogo_winner_item_id,
    catalogoWinnerPrice: row.catalogo_winner_price,
    calculadoEm: row.calculado_em,
  };
}

export async function lerCacheQualidade(supabase: ClienteSupabase): Promise<Map<string, QualidadeAnuncio>> {
  const { data } = await supabase.from("anuncio_qualidade_cache").select("*");
  const mapa = new Map<string, QualidadeAnuncio>();
  for (const row of data ?? []) mapa.set(row.item_id, linhaParaQualidade(row));
  return mapa;
}

// --- Universo de anuncios ATIVOS (unica base elegivel para consulta) ---

// Contagem barata (1 chamada, sem bulk detail) -- usada so para o indicador
// "X de Y verificados" no consolidado, sem custo de rate-limit.
export async function contarAnunciosAtivos(accessToken: string, sellerId: string): Promise<number> {
  try {
    const resp = await fetch(
      `https://api.mercadolibre.com/users/${sellerId}/items/search?status=active&limit=1`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!resp.ok) return 0;
    const data = await resp.json();
    return data.paging?.total ?? 0;
  } catch {
    return 0;
  }
}

export type AnuncioAtivoResumo = { id: string; titulo: string; thumbnail: string };

// Lista completa (com bulk detail) dos anuncios ATIVOS de uma conta --
// usada apenas quando o usuario expande o accordion da conta ou aciona
// "Verificar mais N" (nunca automaticamente no carregamento da pagina).
export async function listarAnunciosAtivos(
  accessToken: string,
  sellerId: string,
  maxItens = 1000
): Promise<AnuncioAtivoResumo[]> {
  const ids: string[] = [];
  const limit = 100;
  let offset = 0;
  while (ids.length < maxItens) {
    const url = `https://api.mercadolibre.com/users/${sellerId}/items/search?status=active&limit=${limit}&offset=${offset}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!resp.ok) break;
    const data = await resp.json();
    const pagina: string[] = data.results ?? [];
    ids.push(...pagina);
    if (pagina.length < limit) break;
    offset += limit;
  }

  const itens = await buscarItensBulk(accessToken, ids.slice(0, maxItens));
  return itens
    .filter((it) => it.status === "active")
    .map((it) => ({
      id: it.id,
      titulo: it.title,
      thumbnail: (it.thumbnail ?? "").replace("http://", "https://"),
    }));
}

// Verifica ate `quantidade` anuncios ATIVOS ainda nao cacheados de uma
// conta (botao "Verificar mais N"). Anuncios pausados/finalizados nunca
// aparecem em listarAnunciosAtivos, entao nunca entram aqui.
export async function verificarLoteQualidade(
  supabase: ClienteSupabase,
  accessToken: string,
  sellerId: string,
  contaId: string,
  quantidade: number
): Promise<number> {
  const [ativos, jaVerificados] = await Promise.all([
    listarAnunciosAtivos(accessToken, sellerId),
    lerCacheQualidade(supabase),
  ]);
  const pendentes = ativos.filter((a) => !jaVerificados.has(a.id)).slice(0, quantidade);

  let verificados = 0;
  for (const anuncio of pendentes) {
    await consultarQualidade(supabase, accessToken, anuncio.id, contaId);
    verificados++;
  }
  return verificados;
}

// --- Agregacao para o card "Consolidado" (geral e por conta) ---

export type ConsolidadoQualidade = {
  verificados: number;
  ativos: number;
  mediaScore: number | null;
  distribuicao: { nivel: string; quantidade: number }[];
  piores: { itemId: string; contaId: string; score: number; nivel: string | null; pendencias: BucketQualidade[] }[];
};

export function montarConsolidado(
  cache: QualidadeAnuncio[],
  ativos: number
): ConsolidadoQualidade {
  const comScore = cache.filter((c) => c.score !== null) as (QualidadeAnuncio & { score: number })[];
  const mediaScore =
    comScore.length > 0 ? Math.round((comScore.reduce((s, c) => s + c.score, 0) / comScore.length) * 10) / 10 : null;

  const distribuicaoMapa = new Map<string, number>();
  for (const c of comScore) {
    const nivel = c.nivel ?? "—";
    distribuicaoMapa.set(nivel, (distribuicaoMapa.get(nivel) ?? 0) + 1);
  }

  const piores = [...comScore]
    .sort((a, b) => a.score - b.score)
    .slice(0, 10)
    .map((c) => ({ itemId: c.itemId, contaId: c.contaId, score: c.score, nivel: c.nivel, pendencias: c.pendencias }));

  return {
    verificados: cache.length,
    ativos,
    mediaScore,
    distribuicao: Array.from(distribuicaoMapa.entries()).map(([nivel, quantidade]) => ({ nivel, quantidade })),
    piores,
  };
}
