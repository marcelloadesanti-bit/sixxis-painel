"use server";

import { createClient } from "@/lib/supabase/server";
import type { TipoSugestao } from "@/lib/mercadolivre/copiloto";

// Marca uma sugestao como ignorada (persistente, por conta+tipo+referencia)
// -- upsert idempotente aproveitando a constraint unica da tabela, entao
// clicar "Ignorar" de novo em algo ja ignorado nao da erro.
export async function ignorarSugestaoAction(
  contaId: string,
  tipo: TipoSugestao,
  referenciaId: string
): Promise<{ ok: boolean; erro?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, erro: "Nao autenticado." };

  const { error } = await supabase.from("copiloto_sugestoes_ignoradas").upsert(
    {
      conta_id: contaId,
      tipo,
      referencia_id: referenciaId,
      ignorado_por: user.id,
    },
    { onConflict: "conta_id,tipo,referencia_id", ignoreDuplicates: true }
  );

  if (error) {
    console.error("Erro ao ignorar sugestao do Co-piloto:", error);
    return { ok: false, erro: "Falha ao salvar." };
  }

  return { ok: true };
}
