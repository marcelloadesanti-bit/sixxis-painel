"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function definirMetaMesAction(formData: FormData) {
  const ano = Number(formData.get("ano"));
  const mes = Number(formData.get("mes"));
  const valor = Number(formData.get("valor"));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    throw new Error("Apenas administradores podem definir metas.");
  }

  if (!ano || !mes || mes < 1 || mes > 12 || !valor || valor <= 0) {
    throw new Error("Informe ano, mês e um valor de meta válido.");
  }

  const { error } = await supabase
    .from("metas_mensais")
    .upsert({ ano, mes, valor, atualizado_em: new Date().toISOString() }, { onConflict: "ano,mes" });

  if (error) {
    throw new Error(`Falha ao salvar meta: ${error.message}`);
  }

  revalidatePath("/dashboard/configuracoes/metas");
  revalidatePath("/dashboard");
  redirect("/dashboard/configuracoes/metas?salvo=1");
}
