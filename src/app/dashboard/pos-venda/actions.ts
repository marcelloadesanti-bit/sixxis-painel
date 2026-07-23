"use server";

import { revalidatePath } from "next/cache";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { responderPergunta } from "@/lib/mercadolivre/questions";

export async function responderPerguntaAction(formData: FormData) {
  const contaId = String(formData.get("contaId") ?? "");
  const questionId = Number(formData.get("questionId"));
  const texto = String(formData.get("texto") ?? "").trim();

  if (!contaId || !questionId || !texto) {
    return;
  }

  const accessToken = await getValidAccessToken(contaId);
  await responderPergunta(accessToken, questionId, texto);

  revalidatePath("/dashboard/pos-venda");
  revalidatePath("/dashboard");
}
