"use server";

import { revalidatePath } from "next/cache";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { notificarStatusEnvioME1 } from "@/lib/mercadolivre/orders";
import { enviarMensagemPack } from "@/lib/mercadolivre/messages";

export async function enviarMensagemCompradorAction(formData: FormData) {
  const contaId = String(formData.get("contaId") ?? "");
  const packId = String(formData.get("packId") ?? "");
  const buyerId = Number(formData.get("buyerId"));
  const mlUserId = Number(formData.get("mlUserId"));
  const mensagem = String(formData.get("mensagem") ?? "").trim();
  const orderId = String(formData.get("orderId") ?? "");

  if (!contaId || !packId || !buyerId || !mlUserId || !mensagem) return;

  const accessToken = await getValidAccessToken(contaId);
  await enviarMensagemPack(accessToken, packId, mlUserId, buyerId, mensagem);

  revalidatePath(`/dashboard/vendas/${orderId}`);
}

export async function atualizarStatusEnvioAction(formData: FormData) {
  const contaId = String(formData.get("contaId") ?? "");
  const shipmentId = Number(formData.get("shipmentId"));
  const status = String(formData.get("status") ?? "") as "shipped" | "not_delivered" | "delivered";
  const substatus = (String(formData.get("substatus") ?? "") || null) as string | null;
  const comentario = String(formData.get("comentario") ?? status);
  const orderId = String(formData.get("orderId") ?? "");

  if (!contaId || !shipmentId || !status) return;

  const accessToken = await getValidAccessToken(contaId);
  await notificarStatusEnvioME1(accessToken, shipmentId, status, substatus, comentario);

  revalidatePath(`/dashboard/vendas/${orderId}`);
}
