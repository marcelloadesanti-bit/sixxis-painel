// Mensagens de pos-venda do Mercado Livre (nao lidas).
// Docs: developers.mercadolivre.com.br/pt_br/mensagens-post-venda

const ML_API = "https://api.mercadolibre.com";

export type ConversaNaoLida = {
  resource: string; // ex: /packs/1234/sellers/5678
  quantidade: number;
  contaId: string;
  contaNickname: string;
};

// Mensagens ainda nao lidas pelo vendedor, agrupadas por conversa (pack/order).
// "Mensagens novas" = quantidade de conversas com pendencia; "Mensagens nao
// respondidas" = soma das mensagens nao lidas em todas as conversas.
export async function getMensagensNaoLidas(
  accessToken: string,
  contaId: string,
  contaNickname: string
): Promise<{ conversas: ConversaNaoLida[]; totalMensagens: number }> {
  const res = await fetch(`${ML_API}/messages/unread?role=seller`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // Algumas contas/aplicacoes nao tem esse recurso habilitado (404) - nesse
  // caso tratamos como "sem mensagens pendentes" em vez de propagar erro,
  // para nao derrubar perguntas/reclamacoes que vieram OK na mesma consulta.
  if (res.status === 404) {
    return { conversas: [], totalMensagens: 0 };
  }
  if (!res.ok) {
    throw new Error(`Falha ao buscar mensagens nao lidas: ${res.status}`);
  }

  const data = (await res.json()) as {
    user_id: number;
    results: { resource: string; count: number }[];
  };

  const conversas: ConversaNaoLida[] = (data.results ?? []).map((r) => ({
    resource: r.resource,
    quantidade: r.count,
    contaId,
    contaNickname,
  }));

  const totalMensagens = conversas.reduce((s, c) => s + c.quantidade, 0);

  return { conversas, totalMensagens };
}

// --- Conversa (thread) de um pack e envio de resposta ---
// Docs: developers.mercadolivre.com.br/pt_br/mensagens-post-venda

export type MensagemPack = {
  id: string;
  texto: string;
  remetenteId: number;
  remetenteNome: string | null;
  dataRecebida: string | null;
  dataLeitura: string | null;
};

export async function getConversaPack(
  accessToken: string,
  packId: string,
  mlUserId: number
): Promise<{ mensagens: MensagemPack[]; statusConversa: string | null }> {
  const res = await fetch(`${ML_API}/messages/packs/${packId}/sellers/${mlUserId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Falha ao buscar conversa do pack ${packId}: ${res.status}`);
  }

  const data = (await res.json()) as {
    conversation_status?: { status?: string };
    messages: {
      id: string;
      text: string;
      from: { user_id: string; name?: string };
      message_date?: { received?: string; read?: string | null };
    }[];
  };

  const mensagens: MensagemPack[] = (data.messages ?? [])
    .map((m) => ({
      id: m.id,
      texto: m.text,
      remetenteId: Number(m.from.user_id),
      remetenteNome: m.from.name ?? null,
      dataRecebida: m.message_date?.received ?? null,
      dataLeitura: m.message_date?.read ?? null,
    }))
    .sort((a, b) => new Date(a.dataRecebida ?? 0).getTime() - new Date(b.dataRecebida ?? 0).getTime());

  return { mensagens, statusConversa: data.conversation_status?.status ?? null };
}

export async function enviarMensagemPack(
  accessToken: string,
  packId: string,
  mlUserId: number,
  buyerId: number,
  texto: string
): Promise<void> {
  const res = await fetch(`${ML_API}/messages/packs/${packId}/sellers/${mlUserId}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: { user_id: String(mlUserId) },
      to: { user_id: String(buyerId) },
      text: texto,
    }),
  });

  if (!res.ok) {
    const corpo = await res.text();
    throw new Error(`Falha ao enviar mensagem do pack ${packId}: ${res.status} ${corpo}`);
  }
}

export async function marcarMensagensComoLidas(accessToken: string, messageIds: string[]): Promise<void> {
  if (messageIds.length === 0) return;
  const res = await fetch(`${ML_API}/messages/mark_as_read/${messageIds.join(",")}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error(`Falha ao marcar mensagens como lidas: ${res.status}`);
  }
}
