// Funcoes de acesso a API de Tendencias e Busca do Mercado Livre.
//
// Fonte dos termos "em alta": GET /trends/{site}[/{categoria}] -- endpoint
// oficial do ML, devolve o top ~50 de termos mais buscados (atualizado
// semanalmente), ja ordenado do mais para o menos buscado. E a mesma fonte
// que ferramentas como Nubimetrics/Mercado Turbo usam.
//
// Limite importante (documentado, nao e bug): o ML nao expoe volume de
// busca para um termo livre qualquer -- so devolve o ranking ja calculado
// do top 50. Por isso, quando o termo pesquisado pelo usuario nao aparece
// no top 50 da categoria, complementamos com um retrato competitivo (numero
// de anuncios concorrentes e faixa de preco) via GET /sites/MLB/search,
// para nunca devolver uma tela vazia.

export type TermoTendencia = { termo: string; url: string; posicao: number };

export type DadosCompetitivos = {
  termo: string;
  disponivel: boolean; // false quando a API de busca publica nao esta liberada para este app
  totalAnuncios: number;
  precoMin: number | null;
  precoMax: number | null;
  precoMedio: number | null;
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

// Termos mais buscados do site inteiro (visao geral da plataforma).
export async function buscarTendenciasSite(accessToken: string): Promise<TermoTendencia[]> {
  const dados = await chamarML<any[]>("https://api.mercadolibre.com/trends/MLB", accessToken);
  return (dados ?? []).map((d, i) => ({ termo: d.keyword, url: d.url, posicao: i + 1 }));
}

// Termos mais buscados dentro de uma categoria especifica.
export async function buscarTendenciasCategoria(
  accessToken: string,
  categoriaId: string
): Promise<TermoTendencia[]> {
  const dados = await chamarML<any[]>(
    `https://api.mercadolibre.com/trends/MLB/${categoriaId}`,
    accessToken
  );
  return (dados ?? []).map((d, i) => ({ termo: d.keyword, url: d.url, posicao: i + 1 }));
}

// Retrato competitivo para um termo de busca livre (usado como
// complemento quando o termo nao esta no top 50 de tendencias, ou como
// contexto extra mesmo quando esta).
//
// Observacao (descoberta ao testar em producao): o endpoint publico de
// busca geral (/sites/MLB/search?q=) retorna 403 "forbidden" para a nossa
// aplicacao -- o ML restringiu esse endpoint a parceiros aprovados. Por
// isso a funcao nunca lanca erro: quando a busca nao estiver liberada,
// devolve `disponivel: false` e a tela mostra um aviso honesto em vez de
// numeros inventados.
export async function buscarDadosCompetitivos(
  accessToken: string,
  termo: string
): Promise<DadosCompetitivos> {
  try {
    const dados = await chamarML<any>(
      `https://api.mercadolibre.com/sites/MLB/search?q=${encodeURIComponent(termo)}&limit=50`,
      accessToken
    );
    const precos: number[] = (dados.results ?? [])
      .map((r: any) => Number(r.price))
      .filter((p: number) => Number.isFinite(p) && p > 0);

    return {
      termo,
      disponivel: true,
      totalAnuncios: dados.paging?.total ?? dados.results?.length ?? 0,
      precoMin: precos.length ? Math.min(...precos) : null,
      precoMax: precos.length ? Math.max(...precos) : null,
      precoMedio: precos.length ? precos.reduce((a, b) => a + b, 0) / precos.length : null,
    };
  } catch {
    return { termo, disponivel: false, totalAnuncios: 0, precoMin: null, precoMax: null, precoMedio: null };
  }
}
