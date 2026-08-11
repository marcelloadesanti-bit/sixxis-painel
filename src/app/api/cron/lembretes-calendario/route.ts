import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listarEventos } from "@/lib/google/calendar";
import { sendTelegramMessage } from "@/lib/telegram";

// Cron de lembretes do Calendario: roda a cada poucos minutos (chamado por
// um workflow do GitHub Actions, ja que o plano Vercel Hobby so permite
// cron nativo 1x/dia) e, para cada usuario com Google Calendar e Telegram
// conectados, verifica se algum evento entrou na janela de aviso de 2 dias
// antes, 1 dia antes ou 30 minutos antes -- e manda a mensagem uma unica
// vez por evento/tipo (controlado por calendario_notificacoes_enviadas).
export const maxDuration = 60;

// Janela de tolerancia: como o cron externo roda a cada 5-10 minutos, uma
// janela de 10 minutos garante que nenhum lembrete seja perdido entre uma
// chamada e outra.
const JANELA_MS = 10 * 60 * 1000;

const LEMBRETES = [
  { tipo: "2dias", offsetMs: 2 * 24 * 60 * 60 * 1000, rotulo: "em 2 dias" },
  { tipo: "1dia", offsetMs: 24 * 60 * 60 * 1000, rotulo: "amanha" },
  { tipo: "30min", offsetMs: 30 * 60 * 1000, rotulo: "em 30 minutos" },
  ] as const;

async function autenticar(request: Request): Promise<boolean> {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
          return true;
    }

  const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    return profile?.role === "admin";
}

function formatarHorario(iso: string): string {
    return new Date(iso).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
    });
}

export async function POST(request: Request) {
    const autorizado = await autenticar(request);
    if (!autorizado) {
          return NextResponse.json({ erro: "Nao autorizado." }, { status: 401 });
    }

  const admin = createAdminClient();
    const agora = new Date();

  const { data: perfis, error: perfisError } = await admin
      .from("profiles")
      .select("id, google_calendar_refresh_token, telegram_chat_id")
      .not("google_calendar_refresh_token", "is", null)
      .not("telegram_chat_id", "is", null);

  if (perfisError) {
        console.error("[lembretes-calendario] Erro ao buscar perfis:", perfisError);
        return NextResponse.json({ erro: "Falha ao buscar perfis." }, { status: 500 });
  }

  let enviados = 0;
    const erros: string[] = [];

  for (const perfil of perfis ?? []) {
        try {
                const em3Dias = new Date(agora.getTime() + 3 * 24 * 60 * 60 * 1000);
                const eventos = await listarEventos(perfil.id, agora.toISOString(), em3Dias.toISOString());

          for (const evento of eventos) {
                    if (evento.diaTodo) continue;
                    const inicioMs = new Date(evento.inicio).getTime();
                    if (Number.isNaN(inicioMs)) continue;

                  for (const lembrete of LEMBRETES) {
                              const horarioLembrete = inicioMs - lembrete.offsetMs;
                              const dentroDaJanela = agora.getTime() >= horarioLembrete && agora.getTime() < horarioLembrete + JANELA_MS;
                              if (!dentroDaJanela) continue;

                      const { error: insertError } = await admin.from("calendario_notificacoes_enviadas").insert({
                                    profile_id: perfil.id,
                                    evento_id: evento.id,
                                    tipo: lembrete.tipo,
                      });

                      if (insertError) {
                                    // Codigo 23505 = violacao de UNIQUE -- ja foi enviado antes, ignora.
                                if (insertError.code !== "23505") {
                                                console.error("[lembretes-calendario] Erro ao registrar notificacao:", insertError);
                                }
                                    continue;
                      }

                      try {
                                    await sendTelegramMessage(
                                                    perfil.telegram_chat_id as string,
                                                    `Lembrete: <b>${evento.titulo}</b> ${lembrete.rotulo} (${formatarHorario(evento.inicio)}).`
                                                  );
                                    enviados += 1;
                      } catch (sendErr) {
                                    console.error("[lembretes-calendario] Erro ao enviar Telegram:", sendErr);
                                    erros.push(`${perfil.id}/${evento.id}/${lembrete.tipo}: falha ao enviar`);
                      }
                  }
          }
        } catch (err) {
                console.error(`[lembretes-calendario] Erro ao processar perfil ${perfil.id}:`, err);
                erros.push(`${perfil.id}: ${err instanceof Error ? err.message : String(err)}`);
        }
  }

  return NextResponse.json({ ok: true, enviados, erros });
}

// Vercel Cron (se algum dia usado) e o workflow do GitHub Actions chamam
// via GET -- reaproveita a mesma logica do POST.
export const GET = POST;
