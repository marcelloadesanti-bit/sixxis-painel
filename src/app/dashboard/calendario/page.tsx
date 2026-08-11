import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { listarEventos } from "@/lib/google/calendar";
import NovoEventoForm from "./novo-evento-form";
import { salvarTelegramChatIdAction } from "./actions";

export const maxDuration = 30;

function formatarDataHora(iso: string, diaTodo: boolean) {
    const data = new Date(iso);
    if (diaTodo) {
          return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
    }
    return data.toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
    });
}

export default async function CalendarioPage({
    searchParams,
}: {
    searchParams: Promise<{ conectado?: string; erro?: string }>;
}) {
    await exigirAcessoSecao("resumo", "calendario");
    const params = await searchParams;
    const supabase = await createClient();

  const {
        data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
        redirect("/login");
  }

  const { data: perfil } = await supabase
      .from("profiles")
      .select("google_calendar_email, telegram_chat_id")
      .eq("id", user.id)
      .single();

  const conectadoGoogle = Boolean(perfil?.google_calendar_email);

  let eventos: Awaited<ReturnType<typeof listarEventos>> = [];
    let erroEventos: string | null = null;

  if (conectadoGoogle) {
        try {
                const agora = new Date();
                const em30Dias = new Date(agora.getTime() + 30 * 24 * 60 * 60 * 1000);
                eventos = await listarEventos(user.id, agora.toISOString(), em30Dias.toISOString());
        } catch (err) {
                console.error("Erro ao listar eventos do Calendario:", err);
                erroEventos = "Falha ao carregar eventos do Google Calendar.";
        }
  }

  return (
        <div className="mx-auto max-w-4xl p-6">
  {params.conectado && (
            <p className="mb-4 rounded bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
              Google Calendar conectado com sucesso.
                        </p>
         )}
  {params.erro && (
            <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
   {params.erro}
           </p>
         )}

      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">Calendário</h1>
        <p className="mb-6 text-sm text-gray-500">
          Agenda vinculada ao seu Google Calendar, com lembretes automáticos por Telegram (2 dias antes, 1 dia antes e
          30 minutos antes).
                  </p>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Google Calendar</h2>
  {conectadoGoogle ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-600 dark:text-gray-300">
                 Conectado como <span className="font-medium">{perfil?.google_calendar_email}</span>
               </p>
               <a
                 href="/api/google-calendar/connect"
                 className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
               >
                 Reconectar
               </a>
             </div>
           ) : (
                       <div className="flex flex-wrap items-center justify-between gap-2">
               <p className="text-sm text-gray-600 dark:text-gray-300">Nenhuma conta Google conectada.</p>
               <a
                 href="/api/google-calendar/connect"
                 className="rounded bg-[var(--color-sixxis-navy)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
               >
                 Conectar Google Calendar
               </a>
             </div>
           )}
        </div>

      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Lembretes por Telegram</h2>
  {perfil?.telegram_chat_id ? (
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Lembretes ativados. Você vai receber aviso 2 dias antes, 1 dia antes e 30 minutos antes de cada evento.
                            </p>
           ) : (
                       <div>
                         <p className="mb-2 text-sm text-gray-600 dark:text-gray-300">
                 Abra o Telegram, procure <span className="font-medium">@Sixxisagenda_bot</span>, envie qualquer
                 mensagem para ele e cole aqui o seu Chat ID.
                               </p>
               <form action={async (formData) => { "use server"; await salvarTelegramChatIdAction(formData); }} className="flex flex-wrap items-center gap-2">
                 <input
                   name="chatId"
                   placeholder="ex: 8436986527"
                   required
                   className="w-48 rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                 />
                 <button
                   type="submit"
                   className="rounded bg-[var(--color-sixxis-navy)] px-4 py-1.5 text-sm font-medium text-white hover:opacity-90"
                 >
                   Salvar
                 </button>
               </form>
             </div>
           )}
        </div>

  {conectadoGoogle && (
            <div className="mb-6">
              <NovoEventoForm />
           </div>
         )}

      <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Próximos eventos (30 dias)</h2>
  {!conectadoGoogle ? (
            <p className="text-sm text-gray-400">Conecte o Google Calendar para ver seus eventos.</p>
          ) : erroEventos ? (
                    <p className="text-sm text-red-500">{erroEventos}</p>
                  ) : eventos.length === 0 ? (
                            <p className="text-sm text-gray-400">Nenhum evento nos próximos 30 dias.</p>
                          ) : (
                                    <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
  {eventos.map((evento) => (
                <li key={evento.id} className="p-3 text-sm">
                  <p className="font-medium text-gray-800 dark:text-gray-100">{evento.titulo}</p>
                 <p className="text-xs text-gray-400">
   {formatarDataHora(evento.inicio, evento.diaTodo)}
   {evento.convidados.length > 0 ? ` · Convidados: ${evento.convidados.join(", ")}` : ""}
                 </p>
               </li>
             ))}
           </ul>
         )}
      </div>
    );
}
