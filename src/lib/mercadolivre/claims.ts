// Reclamacoes/mediacoes do Mercado Livre.
// Docs: developers.mercadolivre.com.br/pt_br/gerenciar-reclamacoes

const ML_API = "https://api.mercadolibre.com";
const LIMITE_POR_PAGINA = 50;
const TETO_RECLAMACOES = 300;

export type Reclamacao = {
  id: number;
  resourceId: number;
  tipo: string;
  etapa: string;
  reasonId: string | null;
  dataCriacao: string;
  ultimaAtualizacao: string;
  contaId: string;
  contaNickname: string;
};

type ClaimApi = {
  id: number;
  resource_id: number;
  type: string;
  stage: string;
  reason_id: string | null;
  date_created: string;
  last_updated: string;
};

// Busca reclamacoes ABERTAS onde a conta e a parte reclamada (respondent),
// paginando ate cobrir o total (ou ate o teto pratico).
export async function getReclamacoesAbertas(
  accessToken: string,
  mlUserId: number,
  contaId: string,
  contaNickname: string
): Promise<{ total: number; reclamacoes: Reclamacao[] }> {
  let offset = 0;
  let total = 0;
  const reclamacoes: Reclamacao[] = [];

  while (true) {
    const params = new URLSearchParams({
      "players.user_id": String(mlUserId),
      "players.role": "respondent",
      status: "opened",
      limit: String(LIMITE_POR_PAGINA),
      offset: String(offset),
    });

    const res = await fetch(`${ML_API}/post-purchase/v1/claims/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Falha ao buscar reclamacoes: ${res.status}`);
    }

    const data = (await res.json()) as { paging: { total: number }; data: ClaimApi[] };
    total = data.paging.total;

    for (const c of data.data) {
      reclamacoes.push({
        id: c.id,
        resourceId: c.resource_id,
        tipo: c.type,
        etapa: c.stage,
        reasonId: c.reason_id,
        dataCriacao: c.date_created,
        ultimaAtualizacao: c.last_updated,
        contaId,
        contaNickname,
      });
    }

    offset += LIMITE_POR_PAGINA;
    if (offset >= total || offset >= TETO_RECLAMACOES || data.data.length === 0) {
      break;
    }
  }

  return { total, reclamacoes };
}
