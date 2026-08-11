"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { criarEvento } from "@/lib/google/calendar";

// Cria um evento no Google Calendar do usuario logado, opcionalmente
// convidando outros Gmails (compartilhamento nativo do Calendar -- os
// convidados recebem o convite por e-mail).
export async function criarEventoAction(formData: FormData) {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
          return { erro: "Nao autenticado." };
    }

  const titulo = String(formData.get("titulo") ?? "").trim();
    const data = String(formData.get("data") ?? "");
    const horaInicio = String(formData.get("horaInicio") ?? "");
    const horaFim = String(formData.get("horaFim") ?? "");
    const convidadosRaw = String(formData.get("convidados") ?? "");
    const descricao = String(formData.get("descricao") ?? "").trim();

  if (!titulo || !data || !horaInicio || !horaFim) {
        return { erro: "Preencha titulo, data e horarios." };
  }

  const convidados = convidadosRaw
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

  try {
        await criarEvento(user.id, {
                titulo,
                descricao: descricao || undefined,
                inicio: `${data}T${horaInicio}:00-03:00`,
                fim: `${data}T${horaFim}:00-03:00`,
                convidados,
        });
  } catch (err) {
        console.error("Erro ao criar evento:", err);
        return { erro: "Falha ao criar evento no Google Calendar." };
  }

  revalidatePath("/dashboard/calendario");
    return { ok: true };
}
