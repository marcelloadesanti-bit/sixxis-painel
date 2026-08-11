// Integracao com o Bot do Telegram para envio de lembretes (Calendario).
// Fluxo: o usuario cria um bot via @BotFather, guarda o TELEGRAM_BOT_TOKEN
// como variavel de ambiente, e manda uma mensagem pro bot uma vez (pra
// capturar o chat_id, que fica salvo em profiles.telegram_chat_id). So
// entao o painel consegue enviar mensagens para ele.

const TELEGRAM_API = "https://api.telegram.org";

export async function sendTelegramMessage(chatId: string, texto: string): Promise<void> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
          throw new Error("TELEGRAM_BOT_TOKEN nao configurado.");
    }

  const res = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
                chat_id: chatId,
                text: texto,
                parse_mode: "HTML",
        }),
  });

  if (!res.ok) {
        const corpo = await res.text();
        throw new Error(`Falha ao enviar mensagem via Telegram: ${res.status} ${corpo}`);
  }
}

// Busca as atualizacoes pendentes do bot (usado manualmente uma unica vez,
// para descobrir o chat_id de um usuario que acabou de mandar mensagem).
export async function getTelegramUpdates(): Promise<unknown> {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
          throw new Error("TELEGRAM_BOT_TOKEN nao configurado.");
    }
    const res = await fetch(`${TELEGRAM_API}/bot${token}/getUpdates`, { cache: "no-store" });
    if (!res.ok) {
          throw new Error(`Falha ao buscar updates do Telegram: ${res.status}`);
    }
    return res.json();
}
