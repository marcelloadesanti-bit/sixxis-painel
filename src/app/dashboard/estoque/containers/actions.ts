"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { podeEditar as podeEditarSecao } from "@/lib/permissoes";

// Mesmo padrao de guarda usado no restante do painel: exige nivel "edicao"
// na secao "estoque" (Containers nao tem nivel proprio -- usa o mesmo nivel
// da secao inteira, igual Vendas/Anuncios/Financeiro).
async function exigirEdicao() {
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
  const podeEditar = podeEditarSecao(isAdmin, profile?.permissoes ?? {}, "estoque");
  if (!podeEditar) throw new Error("Sem permissao para editar Estoque.");

  return supabase;
}

function valorOuNull(formData: FormData, campo: string): string | null {
  const v = String(formData.get(campo) ?? "").trim();
  return v || null;
}

function revalidarPaginas() {
  revalidatePath("/dashboard/estoque/containers");
  revalidatePath("/dashboard/estoque/metricas");
}

export async function criarContainerAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const fornecedor = String(formData.get("fornecedor") ?? "").trim();
  if (!sku || !fornecedor) return;

  await supabase.from("estoque_containers").insert({
    fatura: valorOuNull(formData, "fatura"),
    fornecedor,
    sku,
    quantidade: Number(formData.get("quantidade") ?? 0) || 0,
    data_embarque: valorOuNull(formData, "dataEmbarque"),
    data_prev_chegada: valorOuNull(formData, "dataPrevChegada"),
    data_chegada: valorOuNull(formData, "dataChegada"),
    pago: formData.get("pago") === "on",
    observacoes: valorOuNull(formData, "observacoes"),
  });

  revalidarPaginas();
}

export async function atualizarContainerAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const sku = String(formData.get("sku") ?? "").trim().toUpperCase();
  const fornecedor = String(formData.get("fornecedor") ?? "").trim();
  if (!sku || !fornecedor) return;

  await supabase
    .from("estoque_containers")
    .update({
      fatura: valorOuNull(formData, "fatura"),
      fornecedor,
      sku,
      quantidade: Number(formData.get("quantidade") ?? 0) || 0,
      data_embarque: valorOuNull(formData, "dataEmbarque"),
      data_prev_chegada: valorOuNull(formData, "dataPrevChegada"),
      data_chegada: valorOuNull(formData, "dataChegada"),
      pago: formData.get("pago") === "on",
      observacoes: valorOuNull(formData, "observacoes"),
    })
    .eq("id", id);

  revalidarPaginas();
}

export async function excluirContainerAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await supabase.from("estoque_containers").delete().eq("id", id);

  revalidarPaginas();
}
