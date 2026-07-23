import { refreshAccessToken } from "@/lib/mercadolivre/oauth";
import { createAdminClient } from "@/lib/supabase/admin";

// Retorna sempre um access_token valido para a conta ML informada.
// Se o token estiver perto de expirar (ou ja expirado), renova
// automaticamente usando o refresh_token e atualiza o Supabase.
//
// Uso: antes de qualquer chamada a API do Mercado Livre em nome de uma
// conta conectada, chame getValidAccessToken(mlAccountId) para garantir
// que o token usado na chamada esta valido.

const MARGEM_SEGURANCA_MS = 5 * 60 * 1000; // renova 5 min antes de expirar

export async function getValidAccessToken(mlAccountId: string): Promise<string> {
  const admin = createAdminClient();

  const { data: conta, error } = await admin
    .from("ml_accounts")
    .select("id, access_token, refresh_token, token_expires_at")
    .eq("id", mlAccountId)
    .single();

  if (error || !conta) {
    throw new Error(`Conta ML nao encontrada: ${mlAccountId}`);
  }

  const expiraEm = conta.token_expires_at ? new Date(conta.token_expires_at).getTime() : 0;
  const precisaRenovar = !conta.token_expires_at || expiraEm - Date.now() < MARGEM_SEGURANCA_MS;

  if (!precisaRenovar) {
    return conta.access_token as string;
  }

  const novoToken = await refreshAccessToken(conta.refresh_token as string);
  const novaExpiracao = new Date(Date.now() + novoToken.expires_in * 1000).toISOString();

  const { error: updateError } = await admin
    .from("ml_accounts")
    .update({
      access_token: novoToken.access_token,
      refresh_token: novoToken.refresh_token,
      token_expires_at: novaExpiracao,
    })
    .eq("id", mlAccountId);

  if (updateError) {
    console.error("Erro ao salvar token renovado:", updateError);
  }

  return novoToken.access_token;
}

// Variante que recebe a linha da conta ja carregada (evita um select extra
// quando quem chama ja tem os dados da conta em maos).
export async function getValidAccessTokenFromRow(conta: {
  id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
}): Promise<string> {
  const expiraEm = conta.token_expires_at ? new Date(conta.token_expires_at).getTime() : 0;
  const precisaRenovar = !conta.token_expires_at || expiraEm - Date.now() < MARGEM_SEGURANCA_MS;

  if (!precisaRenovar) {
    return conta.access_token;
  }

  return getValidAccessToken(conta.id);
}
