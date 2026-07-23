// Fluxo de autorizacao OAuth do Mercado Livre.
// Cada conta ML autoriza o app UMA VEZ, gerando um refresh_token
// que fica salvo no Supabase (tabela ml_accounts) associado a conta.
// Nao ha limite fixo de quantas contas podem ser conectadas.
//
// Documentacao oficial: developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao

const ML_AUTH_URL = "https://auth.mercadolivre.com.br/authorization";
const ML_TOKEN_URL = "https://api.mercadolibre.com/oauth/token";

export function buildAuthorizationUrl(state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.ML_CLIENT_ID!,
    redirect_uri: process.env.ML_REDIRECT_URI!,
    state,
  });
  return `${ML_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string) {
  const res = await fetch(ML_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.ML_CLIENT_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.ML_REDIRECT_URI!,
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao trocar code por token: ${res.status}`);
  }
  return res.json() as Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    user_id: number;
    refresh_token: string;
  }>;
}

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(ML_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.ML_CLIENT_ID!,
      client_secret: process.env.ML_CLIENT_SECRET!,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao renovar token: ${res.status}`);
  }
  return res.json() as Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
    user_id: number;
    refresh_token: string;
  }>;
}

export async function getUserInfo(accessToken: string) {
  const res = await fetch("https://api.mercadolibre.com/users/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Falha ao buscar dados da conta ML: ${res.status}`);
  }
  return res.json() as Promise<{
    id: number;
    nickname: string;
    email?: string;
    site_id: string;
  }>;
}
