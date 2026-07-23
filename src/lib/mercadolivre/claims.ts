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
