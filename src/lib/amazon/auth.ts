// Fluxo de autenticacao LWA (Login with Amazon) da SP-API.
// Diferente do Mercado Livre, aqui nao ha authorization code flow por conta:
// o refresh_token de cada conta seller e gerado uma unica vez via
// autoatendimento no Solution Provider Portal (self-authorization) e
// cadastrado manualmente na tabela amazon_accounts. A partir dai, este
// modulo so precisa trocar o refresh_token por um access_token de curta
// duracao (LWA), do mesmo jeito para todas as contas.
//
// Documentacao oficial: developer-docs.amazon.com/sp-api/docs/connecting-to-the-selling-partner-api

const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

export async function refreshAccessToken(refreshToken: string) {
  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.AMAZON_LWA_CLIENT_ID!,
      client_secret: process.env.AMAZON_LWA_CLIENT_SECRET!,
    }),
  });

  if (!res.ok) {
    throw new Error(`Falha ao renovar token Amazon: ${res.status}`);
  }
  return res.json() as Promise<{
    access_token: string;
    token_type: string;
    expires_in: number;
  }>;
}
