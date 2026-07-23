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
