"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { podeEditar, type PermissoesUsuario } from "@/lib/permissoes";

export async function atualizarCorContaAction(formData: FormData) {
  const contaId = String(formData.get("contaId"));
  const cor = String(formData.get("cor"));
  const apelidoBruto = String(formData.get("apelido") ?? "").trim();
  const apelido = apelidoBruto.length > 0 ? apelidoBruto : null;
  const nova = formData.get("nova") === "1";

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
  const permissoes = (profile?.permissoes as PermissoesUsuario) ?? {};
  if (!podeEditar(isAdmin, permissoes, "contas")) {
    throw new Error("Você não tem permissão para alterar a cor ou o apelido de uma conta.");
  }

  await supabase.from("ml_accounts").update({ cor, apelido }).eq("id", contaId);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/contas");

  if (nova) {
    redirect("/dashboard");
  }
  redirect("/dashboard/contas");
}
