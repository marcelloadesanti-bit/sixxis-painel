"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { podeEditar as podeEditarSecao } from "@/lib/permissoes";

// Grava a data de chegada MAIS RECENTE de um SKU -- exclusivamente no nosso
// banco (Supabase). Em nenhuma hipotese isso escreve na planilha do usuario;
// a planilha e tratada como fonte somente-leitura em todo o projeto.
export async function salvarDataChegadaAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role, permissoes").eq("id", user.id).maybeSingle();
  const isAdmin = profile?.role === "admin";
  const podeEditar = podeEditarSecao(isAdmin, profile?.permissoes ?? {}, "estoque");
  if (!podeEditar) return;

  const sku = String(formData.get("sku") ?? "").trim();
  const dataChegada = String(formData.get("dataChegada") ?? "").trim();
  if (!sku) return;

  await supabase.from("estoque_sku_config").upsert(
    {
      sku: sku.toUpperCase(),
      data_chegada: dataChegada || null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "sku" }
  );

  revalidatePath("/dashboard/estoque");
}
