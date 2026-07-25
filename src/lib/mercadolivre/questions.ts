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
  compradorNickname: string | null;
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
  answer?: { text: string; status: string; date_created: string } | null;
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
        compradorNickname: null,
        contaId,
        contaNickname,
      });
    }

    offset += LIMITE_POR_PAGINA;
    if (offset >= total || offset >= TETO_PERGUNTAS || data.questions.length === 0) {
      break;
    }
  }

  // Busca o nickname de cada comprador (uma chamada por comprador unico, em
  // paralelo). O Mercado Livre pode restringir esse dado por privacidade
  // (LGPD) dependendo do caso - nesse cenario o campo fica null e a tela usa
  // o ID do comprador como alternativa.
  const idsUnicos = Array.from(new Set(perguntas.map((p) => p.compradorId).filter((id): id is number => id !== null)));
  const nicknames = await Promise.all(
    idsUnicos.map(async (id) => {
      try {
        const res = await fetch(`${ML_API}/users/${id}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return [id, null] as const;
        const data = (await res.json()) as { nickname?: string };
        return [id, data.nickname ?? null] as const;
      } catch {
        return [id, null] as const;
      }
    })
  );
  const nicknamePorId = new Map(nicknames);
  for (const p of perguntas) {
    if (p.compradorId !== null) {
      p.compradorNickname = nicknamePorId.get(p.compradorId) ?? null;
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

// --- Metricas de SLA (tempo real, por periodo selecionado) ---

export type MetricasPerguntas = {
  totalRecebidas: number;
  totalRespondidas: number;
  taxaRespostaPct: number | null; // null quando nao ha perguntas no periodo
  tempoMedioRespostaMin: number | null; // null quando nao ha nenhuma respondida no periodo
};

// Busca ANSWERED e UNANSWERED e filtra pelo periodo (de/ate, formato
// YYYY-MM-DD) usando date_created, paginando ate ultrapassar o inicio do
// periodo (a API ja devolve ordenado DESC por data). Usado pela secao "SLA
// de atendimento" do Pos-venda - roda a cada carregamento da pagina, entao
// fica limitado a um teto pratico de paginas por status.
async function buscarPerguntasPorStatusNoPeriodo(
  accessToken: string,
  mlUserId: number,
  status: "ANSWERED" | "UNANSWERED",
  periodo: { de: string; ate: string }
): Promise<PerguntaApi[]> {
  const desde = new Date(`${periodo.de}T00:00:00-03:00`).getTime();
  const ate = new Date(`${periodo.ate}T23:59:59-03:00`).getTime();
  const encontradas: PerguntaApi[] = [];
  let offset = 0;

  while (offset < TETO_PERGUNTAS) {
    const params = new URLSearchParams({
      seller_id: String(mlUserId),
      status,
      api_version: "4",
      sort_fields: "date_created",
      sort_types: "DESC",
      limit: String(LIMITE_POR_PAGINA),
      offset: String(offset),
    });

    const res = await fetch(`${ML_API}/questions/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Falha ao buscar perguntas (${status}): ${res.status}`);

    const data = (await res.json()) as { total: number; questions: PerguntaApi[] };
    if (data.questions.length === 0) break;

    let passouDoPeriodo = false;
    for (const q of data.questions) {
      const criada = new Date(q.date_created).getTime();
      if (criada < desde) {
        passouDoPeriodo = true;
        break;
      }
      if (criada <= ate) encontradas.push(q);
    }

    offset += LIMITE_POR_PAGINA;
    if (passouDoPeriodo || offset >= data.total) break;
  }

  return encontradas;
}

export async function getMetricasPerguntas(
  accessToken: string,
  mlUserId: number,
  periodo: { de: string; ate: string }
): Promise<MetricasPerguntas> {
  const [respondidas, naoRespondidas] = await Promise.all([
    buscarPerguntasPorStatusNoPeriodo(accessToken, mlUserId, "ANSWERED", periodo),
    buscarPerguntasPorStatusNoPeriodo(accessToken, mlUserId, "UNANSWERED", periodo),
  ]);

  const totalRespondidas = respondidas.length;
  const totalRecebidas = totalRespondidas + naoRespondidas.length;

  const temposMin = respondidas
    .filter((q) => q.answer?.date_created)
    .map((q) => (new Date(q.answer!.date_created).getTime() - new Date(q.date_created).getTime()) / 60000)
    .filter((min) => min >= 0);

  const tempoMedioRespostaMin =
    temposMin.length > 0 ? temposMin.reduce((s, v) => s + v, 0) / temposMin.length : null;

  return {
    totalRecebidas,
    totalRespondidas,
    taxaRespostaPct: totalRecebidas > 0 ? (totalRespondidas / totalRecebidas) * 100 : null,
    tempoMedioRespostaMin,
  };
}

// Versao leve: so o total de perguntas nao respondidas (uma unica chamada,
// sem paginar nem buscar nickname dos compradores). Usada para polling
// frequente (sino de notificacoes).
export async function getContagemPerguntasNaoRespondidas(
  accessToken: string,
  mlUserId: number
): Promise<number> {
  const params = new URLSearchParams({
    seller_id: String(mlUserId),
    status: "UNANSWERED",
    api_version: "4",
    limit: "1",
    offset: "0",
  });

  const res = await fetch(`${ML_API}/questions/search?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Falha ao contar perguntas: ${res.status}`);
  }

  const data = (await res.json()) as { total: number };
  return data.total;
}
