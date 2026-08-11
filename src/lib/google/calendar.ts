// Leitura/escrita de eventos no Google Calendar do usuario conectado. Usa o
// refresh_token salvo em profiles (ver calendar-oauth.ts) para gerar um
// access_token valido a cada chamada, renovando quando necessario -- mesmo
// padrao de getValidAccessToken usado para as contas ML/Amazon.

import { refreshGoogleAccessToken } from "@/lib/google/calendar-oauth";
import { createAdminClient } from "@/lib/supabase/admin";

const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MARGEM_SEGURANCA_MS = 5 * 60 * 1000;

// Cache em memoria (por instancia da funcao serverless) do access_token
// atual de cada perfil, pra nao renovar a cada chamada dentro da mesma
// execucao.
const cache = new Map<string, { token: string; expiresAt: number }>();

export async function getValidGoogleAccessToken(profileId: string): Promise<string> {
    const emCache = cache.get(profileId);
    if (emCache && emCache.expiresAt > Date.now() + MARGEM_SEGURANCA_MS) {
          return emCache.token;
    }

  const admin = createAdminClient();
    const { data: perfil, error } = await admin
      .from("profiles")
      .select("google_calendar_refresh_token")
      .eq("id", profileId)
      .single();

  if (error || !perfil?.google_calendar_refresh_token) {
        throw new Error("Google Calendar nao conectado para este usuario.");
  }

  const novoToken = await refreshGoogleAccessToken(perfil.google_calendar_refresh_token as string);
    cache.set(profileId, {
          token: novoToken.access_token,
          expiresAt: Date.now() + novoToken.expires_in * 1000,
    });
    return novoToken.access_token;
}

export type EventoCalendario = {
    id: string;
    titulo: string;
    descricao: string | null;
    inicio: string;
    fim: string;
    diaTodo: boolean;
    convidados: string[];
    link: string | null;
};

type EventoGoogleRaw = {
    id: string;
    summary?: string;
    description?: string;
    htmlLink?: string;
    start?: { date?: string; dateTime?: string };
    end?: { date?: string; dateTime?: string };
    attendees?: { email?: string }[];
};

function converterEvento(raw: EventoGoogleRaw): EventoCalendario {
    return {
          id: raw.id,
          titulo: raw.summary ?? "(sem titulo)",
          descricao: raw.description ?? null,
          inicio: raw.start?.dateTime ?? raw.start?.date ?? "",
          fim: raw.end?.dateTime ?? raw.end?.date ?? "",
          diaTodo: !raw.start?.dateTime,
          convidados: (raw.attendees ?? []).map((a) => a.email).filter((e): e is string => Boolean(e)),
      link: raw.htmlLink ?? null,
        };
}

// Lista os eventos entre timeMin e timeMax (ISO), ordenados por data de
// inicio. Usado tanto na UI (proximos eventos) quanto no cron de lembretes.
export async function listarEventos(
    profileId: string,
    timeMin: string,
    timeMax: string
  ): Promise<EventoCalendario[]> {
  const accessToken = await getValidGoogleAccessToken(profileId);
    const params = new URLSearchParams({
          timeMin,
          timeMax,
          singleEvents: "true",
          orderBy: "startTime",
          maxResults: "250",
    });
    const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
    });
    if (!res.ok) {
          const corpo = await res.text();
          throw new Error(`Falha ao listar eventos do Google Calendar: ${res.status} ${corpo}`);
    }
    const data = await res.json();
    return (data.items ?? []).map(converterEvento);
}

// Cria um evento novo, opcionalmente convidando outros Gmails (compartilhar
// -- eles recebem convite por e-mail e o evento aparece no calendario deles).
export async function criarEvento(
    profileId: string,
    evento: {
          titulo: string;
          descricao?: string;
          inicio: string;
          fim: string;
          convidados?: string[];
    }
  ): Promise<EventoCalendario> {
    const accessToken = await getValidGoogleAccessToken(profileId);
    const body = {
          summary: evento.titulo,
          description: evento.descricao ?? undefined,
          start: { dateTime: evento.inicio, timeZone: "America/Sao_Paulo" },
          end: { dateTime: evento.fim, timeZone: "America/Sao_Paulo" },
          attendees: (evento.convidados ?? []).map((email) => ({ email })),
    };

  const params = new URLSearchParams({ sendUpdates: "all" });
    const res = await fetch(`${CALENDAR_API}/calendars/primary/events?${params.toString()}`, {
          method: "POST",
          headers: {
                  Authorization: `Bearer ${accessToken}`,
                  "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
    });
    if (!res.ok) {
          const corpo = await res.text();
          throw new Error(`Falha ao criar evento no Google Calendar: ${res.status} ${corpo}`);
    }
    const data = await res.json();
    return converterEvento(data);
}

// Remove um evento (ex: usuario cancelou).
export async function excluirEvento(profileId: string, eventoId: string): Promise<void> {
    const accessToken = await getValidGoogleAccessToken(profileId);
    const res = await fetch(`${CALENDAR_API}/calendars/primary/events/${eventoId}?sendUpdates=all`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok && res.status !== 410) {
          const corpo = await res.text();
          throw new Error(`Falha ao excluir evento do Google Calendar: ${res.status} ${corpo}`);
    }
}
