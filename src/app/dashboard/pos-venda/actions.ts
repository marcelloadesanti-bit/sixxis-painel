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

import { enviarMensagemClaim, abrirDisputaClaim, reembolsarTotalClaim } from "@/lib/mercadolivre/claims";

export async function enviarMensagemReclamacaoAction(formData: FormData) {
  const contaId = String(formData.get("contaId") ?? "");
  const claimId = Number(formData.get("claimId"));
  const receiverRole = String(formData.get("receiverRole") ?? "") as
    | "complainant"
    | "mediator"
    | "respondent";
  const mensagem = String(formData.get("mensagem") ?? "").trim();

  if (!contaId || !claimId || !receiverRole || !mensagem) return;

  const accessToken = await getValidAccessToken(contaId);
  await enviarMensagemClaim(accessToken, claimId, receiverRole, mensagem);

  revalidatePath(`/dashboard/pos-venda/reclamacoes/${claimId}`);
}

export async function abrirDisputaAction(formData: FormData) {
  const contaId = String(formData.get("contaId") ?? "");
  const claimId = Number(formData.get("claimId"));
  if (!contaId || !claimId) return;

  const accessToken = await getValidAccessToken(contaId);
  await abrirDisputaClaim(accessToken, claimId);

  revalidatePath(`/dashboard/pos-venda/reclamacoes/${claimId}`);
}

export async function reembolsarAction(formData: FormData) {
  const contaId = String(formData.get("contaId") ?? "");
  const claimId = Number(formData.get("claimId"));
  if (!contaId || !claimId) return;

  const accessToken = await getValidAccessToken(contaId);
  await reembolsarTotalClaim(accessToken, claimId);

  revalidatePath(`/dashboard/pos-venda/reclamacoes/${claimId}`);
  revalidatePath("/dashboard/pos-venda");
}

import { enviarMensagemPack, marcarMensagensComoLidas } from "@/lib/mercadolivre/messages";

export async function enviarMensagemPackAction(formData: FormData) {
  const contaId = String(formData.get("contaId") ?? "");
  const packId = String(formData.get("packId") ?? "");
  const buyerId = Number(formData.get("buyerId"));
  const mensagem = String(formData.get("mensagem") ?? "").trim();
  const mlUserId = Number(formData.get("mlUserId"));

  if (!contaId || !packId || !buyerId || !mensagem || !mlUserId) return;

  const accessToken = await getValidAccessToken(contaId);
  await enviarMensagemPack(accessToken, packId, mlUserId, buyerId, mensagem);

  revalidatePath(`/dashboard/pos-venda/mensagens/${packId}`);
  revalidatePath("/dashboard/pos-venda");
  revalidatePath("/dashboard");
}

export async function marcarComoLidoAction(contaId: string, messageIds: string[]) {
  if (messageIds.length === 0) return;
  try {
    const accessToken = await getValidAccessToken(contaId);
    await marcarMensagensComoLidas(accessToken, messageIds);
  } catch (err) {
    console.error("Falha ao marcar mensagens como lidas:", err);
  }
}
