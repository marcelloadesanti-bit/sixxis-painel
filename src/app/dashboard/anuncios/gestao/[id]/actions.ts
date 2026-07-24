"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { podeEditar } from "@/lib/permissoes";

async function exigirEdicaoAnuncios() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissoes")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin";
  if (!podeEditar(isAdmin, profile?.permissoes ?? {}, "anuncios")) {
    throw new Error("Seu acesso a Anúncios é somente leitura.");
  }
}

async function chamarML(
  accessToken: string,
  itemId: string,
  corpo: Record<string, unknown>
): Promise<{ ok: boolean; erro?: string }> {
  const resp = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  if (resp.ok) return { ok: true };
  const data = await resp.json().catch(() => null);
  const erro = data?.cause?.[0]?.message ?? data?.message ?? "Erro desconhecido do Mercado Livre.";
  return { ok: false, erro };
}

export async function atualizarPrecoAction(formData: FormData) {
  await exigirEdicaoAnuncios();

  const contaId = String(formData.get("contaId"));
  const itemId = String(formData.get("itemId"));
  const preco = Number(formData.get("preco"));

  const accessToken = await getValidAccessToken(contaId);
  const resultado = await chamarML(accessToken, itemId, { price: preco });

  revalidatePath(`/dashboard/anuncios/gestao/${itemId}`);

  if (!resultado.ok) {
    redirect(`/dashboard/anuncios/gestao/${itemId}?conta=${contaId}&erro=${encodeURIComponent(resultado.erro!)}`);
  }
  redirect(`/dashboard/anuncios/gestao/${itemId}?conta=${contaId}&ok=preco`);
}

export async function atualizarEstoqueAction(formData: FormData) {
  await exigirEdicaoAnuncios();

  const contaId = String(formData.get("contaId"));
  const itemId = String(formData.get("itemId"));
  const estoque = Number(formData.get("estoque"));

  const accessToken = await getValidAccessToken(contaId);
  const resultado = await chamarML(accessToken, itemId, { available_quantity: estoque });

  revalidatePath(`/dashboard/anuncios/gestao/${itemId}`);

  if (!resultado.ok) {
    redirect(`/dashboard/anuncios/gestao/${itemId}?conta=${contaId}&erro=${encodeURIComponent(resultado.erro!)}`);
  }
  redirect(`/dashboard/anuncios/gestao/${itemId}?conta=${contaId}&ok=estoque`);
}

export async function pausarOuAtivarAction(formData: FormData) {
  await exigirEdicaoAnuncios();

  const contaId = String(formData.get("contaId"));
  const itemId = String(formData.get("itemId"));
  const novoStatus = String(formData.get("status")); // "active" | "paused"

  const accessToken = await getValidAccessToken(contaId);
  const resultado = await chamarML(accessToken, itemId, { status: novoStatus });

  revalidatePath(`/dashboard/anuncios/gestao/${itemId}`);
  revalidatePath("/dashboard/anuncios/gestao");
  revalidatePath("/dashboard/anuncios");

  if (!resultado.ok) {
    redirect(`/dashboard/anuncios/gestao/${itemId}?conta=${contaId}&erro=${encodeURIComponent(resultado.erro!)}`);
  }
  redirect(`/dashboard/anuncios/gestao/${itemId}?conta=${contaId}&ok=status`);
}

export async function atualizarTituloAction(formData: FormData) {
  await exigirEdicaoAnuncios();

  const contaId = String(formData.get("contaId"));
  const itemId = String(formData.get("itemId"));
  const titulo = String(formData.get("titulo"));

  const accessToken = await getValidAccessToken(contaId);
  const resultado = await chamarML(accessToken, itemId, { title: titulo });

  revalidatePath(`/dashboard/anuncios/gestao/${itemId}`);

  if (!resultado.ok) {
    redirect(`/dashboard/anuncios/gestao/${itemId}?conta=${contaId}&erro=${encodeURIComponent(resultado.erro!)}`);
  }
  redirect(`/dashboard/anuncios/gestao/${itemId}?conta=${contaId}&ok=titulo`);
}

export async function atualizarVariacaoAction(formData: FormData) {
  await exigirEdicaoAnuncios();

  const contaId = String(formData.get("contaId"));
  const itemId = String(formData.get("itemId"));
  const variacaoId = Number(formData.get("variacaoId"));
  const preco = Number(formData.get("preco"));
  const estoque = Number(formData.get("estoque"));

  const accessToken = await getValidAccessToken(contaId);
  const resultado = await chamarML(accessToken, itemId, {
    variations: [{ id: variacaoId, price: preco, available_quantity: estoque }],
  });

  revalidatePath(`/dashboard/anuncios/gestao/${itemId}`);

  if (!resultado.ok) {
    redirect(`/dashboard/anuncios/gestao/${itemId}?conta=${contaId}&erro=${encodeURIComponent(resultado.erro!)}`);
  }
  redirect(`/dashboard/anuncios/gestao/${itemId}?conta=${contaId}&ok=variacao`);
}
