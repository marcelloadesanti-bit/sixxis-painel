// Fluxo de autorizacao OAuth do Google Calendar (por usuario do painel, nao
// por conta ML/Amazon). Cada usuario conecta o proprio Gmail UMA VEZ,
// gerando um refresh_token que fica salvo no Supabase
// (profiles.google_calendar_refresh_token). Diferente das integracoes
// Sheets/Maps (conta de servico), aqui precisa ser OAuth de verdade -- so
// assim o painel consegue ler/criar eventos no Google Calendar pessoal do
// usuario e convidar outros Gmails (compartilhar).
//
// Antes de usar: criar um "ID do cliente OAuth" (tipo App da Web) no mesmo
// projeto Google Cloud ja usado para Sheets/Maps, com a Google Calendar API
// habilitada e a tela de consentimento em status "Em producao" (senao o
// Google derruba o refresh_token em 7 dias).

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ");

export function buildGoogleAuthorizationUrl(state: string) {
    const params = new URLSearchParams({
          client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
          redirect_uri: process.env.GOOGLE_CALENDAR_REDIRECT_URI!,
          response_type: "code",
          access_type: "offline",
          prompt: "consent",
          scope: SCOPES,
          state,
    });
    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCodeForToken(code: string) {
    const res = await fetch(GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
                  grant_type: "authorization_code",
                  client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
                  client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
                  code,
                  redirect_uri: process.env.GOOGLE_CALENDAR_REDIRECT_URI!,
          }),
    });

  if (!res.ok) {
        const corpo = await res.text();
        throw new Error(`Falha ao trocar code por token (Google Calendar): ${res.status} ${corpo}`);
  }
    return res.json() as Promise<{
          access_token: string;
          refresh_token?: string;
          expires_in: number;
          scope: string;
          token_type: string;
          id_token?: string;
    }>;
}

export async function refreshGoogleAccessToken(refreshToken: string) {
    const res = await fetch(GOOGLE_TOKEN_URL, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
                  grant_type: "refresh_token",
                  client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
                  client_secret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET!,
                  refresh_token: refreshToken,
          }),
    });

  if (!res.ok) {
        const corpo = await res.text();
        throw new Error(`Falha ao renovar token do Google Calendar: ${res.status} ${corpo}`);
  }
    return res.json() as Promise<{
          access_token: string;
          expires_in: number;
          scope: string;
          token_type: string;
    }>;
}

// Busca o e-mail da conta Google conectada (pra exibir na UI qual Gmail
// esta vinculado).
export async function getGoogleUserEmail(accessToken: string): Promise<string | null> {
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.email ?? null;
}
