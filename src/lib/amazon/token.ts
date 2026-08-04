import { refreshAccessToken } from "@/lib/amazon/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarAlerta } from "@/lib/alertas/email";

// Retorna sempre um access_token valido (LWA) para a conta Amazon informada.
// Se o token estiver perto de expirar (ou ja expirado), renova
// automaticamente usando o refresh_token e atualiza o Supabase.
//
// Uso: antes de qualquer chamada a SP-API em nome de uma conta Amazon
// conectada, chame getValidAccessToken(amazonAccountId) para garantir
// que o token usado na chamada esta valido.
//
// Nota: o access_token da Amazon dura apenas 1 hora (bem mais curto que
// o do Mercado Livre), entao a renovacao acontece com mais frequencia.
// Diferente do ML, a Amazon nao rotaciona o refresh_token a cada renovacao,
// entao so precisamos atualizar access_token e token_expires_at.

const MARGEM_SEGURANCA_MS = 5 * 60 * 1000; // renova 5 min antes de expirar

export async function getValidAccessToken(amazonAccountId: string): Promise<string> {
  const admin = createAdminClient();

  const { data: conta, error } = await admin
    .from("amazon_accounts")
    .select("id, access_token, refresh_token, token_expires_at, apelido, nickname")
    .eq("id", amazonAccountId)
    .single();

  if (error || !conta) {
    throw new Error(`Conta Amazon nao encontrada: ${amazonAccountId}`);
  }

  const expiraEm = conta.token_expires_at ? new Date(conta.token_expires_at).getTime() : 0;
  const precisaRenovar = !conta.token_expires_at || expiraEm - Date.now() < MARGEM_SEGURANCA_MS;

  if (!precisaRenovar && conta.access_token) {
    return conta.access_token as string;
  }

try {
  const novoToken = await refreshAccessToken(conta.refresh_token as string);
  const novaExpiracao = new Date(Date.now() + novoToken.expires_in * 1000).toISOString();

  const { error: updateError } = await admin
    .from("amazon_accounts")
    .update({
      access_token: novoToken.access_token,
      token_expires_at: novaExpiracao,
    })
    .eq("id", amazonAccountId);

  if (updateError) {
    console.error("Erro ao salvar token Amazon renovado:", updateError);
  }

  return novoToken.access_token;
} catch (err) {
  await enviarAlerta(
    "Falha ao renovar token da Amazon",
    `Conta ${conta.apelido || conta.nickname || amazonAccountId}: nao foi possivel renovar o token. ` + (err instanceof Error ? err.message : String(err))
    );
  throw err;
}
}

// Variante que recebe a linha da conta ja carregada (evita um select extra
// quando quem chama ja tem os dados da conta em maos).
export async function getValidAccessTokenFromRow(conta: {
  id: string;
  access_token: string | null;
  refresh_token: string;
  token_expires_at: string | null;
}): Promise<string> {
  const expiraEm = conta.token_expires_at ? new Date(conta.token_expires_at).getTime() : 0;
  const precisaRenovar = !conta.token_expires_at || expiraEm - Date.now() < MARGEM_SEGURANCA_MS;

  if (!precisaRenovar && conta.access_token) {
    return conta.access_token;
  }

  return getValidAccessToken(conta.id);
}
