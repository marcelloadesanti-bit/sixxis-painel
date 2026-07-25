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

// Busca reclamacoes de um status especifico criadas dentro de um periodo
// (de/ate, formato YYYY-MM-DD), paginando ate ultrapassar o inicio do
// periodo. Usado pela secao "SLA de atendimento" (tempo medio de resolucao)
// e pela secao de Devolucoes - ambas recalculadas a cada carregamento da
// pagina, dentro do periodo selecionado pelo usuario.
async function buscarReclamacoesPorStatusNoPeriodo(
  accessToken: string,
  mlUserId: number,
  status: "opened" | "closed",
  periodo: { de: string; ate: string },
  contaId: string,
  contaNickname: string
): Promise<Reclamacao[]> {
  const desde = new Date(`${periodo.de}T00:00:00-03:00`).getTime();
  const ate = new Date(`${periodo.ate}T23:59:59-03:00`).getTime();
  const encontradas: Reclamacao[] = [];
  let offset = 0;

  while (offset < TETO_RECLAMACOES) {
    const params = new URLSearchParams({
      "players.user_id": String(mlUserId),
      "players.role": "respondent",
      status,
      limit: String(LIMITE_POR_PAGINA),
      offset: String(offset),
    });

    const res = await fetch(`${ML_API}/post-purchase/v1/claims/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Falha ao buscar reclamacoes (${status}): ${res.status}`);

    const data = (await res.json()) as { paging: { total: number }; data: ClaimApi[] };
    if (data.data.length === 0) break;

    let passouDoPeriodo = false;
    for (const c of data.data) {
      const criada = new Date(c.date_created).getTime();
      if (criada < desde) {
        passouDoPeriodo = true;
        break;
      }
      if (criada <= ate) {
        encontradas.push({
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
    }

    offset += LIMITE_POR_PAGINA;
    if (passouDoPeriodo || offset >= data.paging.total) break;
  }

  return encontradas;
}

export type MetricasReclamacoes = {
  totalAbertasNoPeriodo: number;
  totalFechadasNoPeriodo: number;
  tempoMedioResolucaoMin: number | null; // media de (last_updated - date_created) das fechadas no periodo
};

// Metricas de SLA das reclamacoes dentro do periodo selecionado. O tempo de
// resolucao usa last_updated como aproximacao da data de fechamento (a busca
// em lista nao traz "date_closed" - so o detalhe por reclamacao, que seria
// caro de buscar 1 a 1 para todas). E uma aproximacao deliberada, documentada
// aqui para quem for revisar o calculo no futuro.
export async function getMetricasReclamacoes(
  accessToken: string,
  mlUserId: number,
  periodo: { de: string; ate: string }
): Promise<MetricasReclamacoes> {
  const [abertas, fechadas] = await Promise.all([
    buscarReclamacoesPorStatusNoPeriodo(accessToken, mlUserId, "opened", periodo, "", ""),
    buscarReclamacoesPorStatusNoPeriodo(accessToken, mlUserId, "closed", periodo, "", ""),
  ]);

  const temposMin = fechadas
    .map((r) => (new Date(r.ultimaAtualizacao).getTime() - new Date(r.dataCriacao).getTime()) / 60000)
    .filter((min) => min >= 0);

  return {
    totalAbertasNoPeriodo: abertas.length,
    totalFechadasNoPeriodo: fechadas.length,
    tempoMedioResolucaoMin: temposMin.length > 0 ? temposMin.reduce((s, v) => s + v, 0) / temposMin.length : null,
  };
}

// Todas as reclamacoes (abertas + fechadas) criadas no periodo, com dados de
// conta - usado pela secao de Devolucoes para saber quais claims checar.
export async function getReclamacoesNoPeriodo(
  accessToken: string,
  mlUserId: number,
  periodo: { de: string; ate: string },
  contaId: string,
  contaNickname: string
): Promise<Reclamacao[]> {
  const [abertas, fechadas] = await Promise.all([
    buscarReclamacoesPorStatusNoPeriodo(accessToken, mlUserId, "opened", periodo, contaId, contaNickname),
    buscarReclamacoesPorStatusNoPeriodo(accessToken, mlUserId, "closed", periodo, contaId, contaNickname),
  ]);
  return [...abertas, ...fechadas];
}

// --- Detalhe, mensagens e acoes de uma reclamacao especifica ---
// Docs: gerenciar-mensagem-de-uma-eclamacao / gerenciar-resolucao-de-reclamacoes

export type AcaoDisponivel = {
  action: string;
  mandatory: boolean;
  dueDate: string | null;
};

export type ClaimPlayer = {
  role: string;
  type: string;
  userId: number;
  acoesDisponiveis: AcaoDisponivel[];
};

export type ClaimDetalhe = {
  id: number;
  resourceId: number;
  status: string;
  tipo: string;
  etapa: string;
  reasonId: string | null;
  players: ClaimPlayer[];
  dataCriacao: string;
  ultimaAtualizacao: string;
};

export async function getClaimDetalhe(accessToken: string, claimId: number): Promise<ClaimDetalhe> {
  const res = await fetch(`${ML_API}/post-purchase/v1/claims/${claimId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Falha ao buscar detalhe da reclamação: ${res.status}`);

  const c = (await res.json()) as {
    id: number;
    resource_id: number;
    status: string;
    type: string;
    stage: string;
    reason_id: string | null;
    date_created: string;
    last_updated: string;
    players: {
      role: string;
      type: string;
      user_id: number;
      available_actions?: { action: string; mandatory?: boolean; due_date?: string | null }[];
    }[];
  };

  return {
    id: c.id,
    resourceId: c.resource_id,
    status: c.status,
    tipo: c.type,
    etapa: c.stage,
    reasonId: c.reason_id,
    dataCriacao: c.date_created,
    ultimaAtualizacao: c.last_updated,
    players: c.players.map((p) => ({
      role: p.role,
      type: p.type,
      userId: p.user_id,
      acoesDisponiveis: (p.available_actions ?? []).map((a) => ({
        action: a.action,
        mandatory: a.mandatory ?? false,
        dueDate: a.due_date ?? null,
      })),
    })),
  };
}

export type MensagemClaim = {
  senderRole: string;
  receiverRole: string;
  mensagem: string;
  dataCriacao: string;
  etapa: string;
};

export async function getMensagensClaim(accessToken: string, claimId: number): Promise<MensagemClaim[]> {
  const res = await fetch(`${ML_API}/post-purchase/v1/claims/${claimId}/messages`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Falha ao buscar mensagens da reclamação: ${res.status}`);

  const data = (await res.json()) as {
    sender_role: string;
    receiver_role: string;
    message: string;
    date_created: string;
    stage: string;
  }[];

  return data
    .map((m) => ({
      senderRole: m.sender_role,
      receiverRole: m.receiver_role,
      mensagem: m.message,
      dataCriacao: m.date_created,
      etapa: m.stage,
    }))
    .sort((a, b) => new Date(a.dataCriacao).getTime() - new Date(b.dataCriacao).getTime());
}

export async function enviarMensagemClaim(
  accessToken: string,
  claimId: number,
  receiverRole: "complainant" | "mediator" | "respondent",
  mensagem: string
): Promise<void> {
  const res = await fetch(`${ML_API}/post-purchase/v1/claims/${claimId}/actions/send-message`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ receiver_role: receiverRole, message: mensagem, attachments: [] }),
  });
  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`Falha ao enviar mensagem da reclamação ${claimId}: ${res.status} ${corpo}`);
  }
}

export async function abrirDisputaClaim(accessToken: string, claimId: number): Promise<void> {
  const res = await fetch(`${ML_API}/post-purchase/v1/claims/${claimId}/actions/open-dispute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`Falha ao abrir disputa da reclamação ${claimId}: ${res.status} ${corpo}`);
  }
}

export async function reembolsarTotalClaim(accessToken: string, claimId: number): Promise<void> {
  const res = await fetch(`${ML_API}/post-purchase/v1/claims/${claimId}/expected-resolutions/refund`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`Falha ao reembolsar reclamação ${claimId}: ${res.status} ${corpo}`);
  }
}
