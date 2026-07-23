// Perguntas (Q&A) do Mercado Livre.
// Docs: developers.mercadolivre.com.br/pt_br/gerenciamento-perguntas-respostas

const ML_API = "https://api.mercadolibre.com";
const LIMITE_POR_PAGINA = 50;
const TETO_PERGUNTAS = 500; // teto pratico para a lista de nao respondidas

export type Pergunta = {
  id: number;
  itemId: string;
  texto: string;
  dataCriacao: string;
  compradorId: number | null;
  contaId: string;
  contaNickname: string;
};

type PerguntaApi = {
  id: number;
  item_id: string;
  text: string;
  date_created: string;
  status: string;
  from?: { id?: number };
};

// Busca perguntas nao respondidas de uma conta, paginando ate cobrir o total
// (ou ate o teto pratico). Usado tanto para o contador quanto para a lista
// exibida na aba Pos-venda.
export async function getPerguntasNaoRespondidas(
  accessToken: string,
  mlUserId: number,
  contaId: string,
  contaNickname: string
): Promise<{ total: number; perguntas: Pergunta[] }> {
  let offset = 0;
  let total = 0;
  const perguntas: Pergunta[] = [];

  while (true) {
    const params = new URLSearchParams({
      seller_id: String(mlUserId),
      status: "UNANSWERED",
      api_version: "4",
      sort_fields: "date_created",
      sort_types: "DESC",
      limit: String(LIMITE_POR_PAGINA),
      offset: String(offset),
    });

    const res = await fetch(`${ML_API}/questions/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Falha ao buscar perguntas: ${res.status}`);
    }

    const data = (await res.json()) as { total: number; questions: PerguntaApi[] };
    total = data.total;

    for (const q of data.questions) {
      perguntas.push({
        id: q.id,
        itemId: q.item_id,
        texto: q.text,
        dataCriacao: q.date_created,
        compradorId: q.from?.id ?? null,
        contaId,
        contaNickname,
      });
    }

    offset += LIMITE_POR_PAGINA;
    if (offset >= total || offset >= TETO_PERGUNTAS || data.questions.length === 0) {
      break;
    }
  }

  return { total, perguntas };
}

// Responde uma pergunta em nome do vendedor.
export async function responderPergunta(
  accessToken: string,
  questionId: number,
  texto: string
): Promise<void> {
  const res = await fetch(`${ML_API}/answers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({ question_id: questionId, text: texto }),
  });

  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`Falha ao responder pergunta ${questionId}: ${res.status} ${corpo}`);
  }
}
