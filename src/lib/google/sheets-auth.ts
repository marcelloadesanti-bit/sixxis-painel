// Autenticacao via conta de servico do Google (JWT/OAuth2), sem SDK externo --
// mesmo padrao de fetch cru usado nas integracoes ML/Amazon deste projeto.
// Usada apenas para LEITURA (escopo spreadsheets.readonly). O painel nunca
// escreve em planilhas do usuario -- somente le o estado mais recente.

import { createSign } from "crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

let cachedToken: { token: string; expiresAt: number } | null = null;

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function assinarJwt(clientEmail: string, privateKey: string): string {
  const header = { alg: "RS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: clientEmail,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = base64url(signer.sign(privateKey));
  return `${unsigned}.${signature}`;
}

// Troca o JWT assinado por um access_token de curta duracao (1h), com cache
// em memoria entre chamadas na mesma instancia da funcao serverless.
export async function getGoogleSheetsAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }

  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (!clientEmail || !privateKeyRaw) {
    throw new Error("GOOGLE_SHEETS_CLIENT_EMAIL / GOOGLE_SHEETS_PRIVATE_KEY nao configurados.");
  }
  const privateKey = privateKeyRaw.replace(/\\n/g, "\n");

  const jwt = assinarJwt(clientEmail, privateKey);
  // cache: "no-store" -- nunca deixar o Next.js reaproveitar (Data Cache) uma
  // resposta antiga de autenticacao; sempre autenticar de verdade.
  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    cache: "no-store",
  });

  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`Falha ao autenticar com o Google (Sheets): ${resp.status} ${texto}`);
  }

  const data = await resp.json();
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

// Le um intervalo (range) de uma planilha -- SOMENTE LEITURA, nunca escreve.
export async function lerIntervaloPlanilha(spreadsheetId: string, range: string): Promise<string[][]> {
  const token = await getGoogleSheetsAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const texto = await resp.text();
    throw new Error(`Falha ao ler a planilha (${range}): ${resp.status} ${texto}`);
  }
  const data = await resp.json();
  return data.values ?? [];
}
