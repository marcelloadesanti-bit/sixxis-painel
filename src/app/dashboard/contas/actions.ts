"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function atualizarCorContaAction(formData: FormData) {
  const contaId = String(formData.get("contaId"));
  const cor = String(formData.get("cor"));
  const nova = formData.get("nova") === "1";

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
    throw new Error("Apenas administradores podem alterar a cor de uma conta.");
  }

  await supabase.from("ml_accounts").update({ cor }).eq("id", contaId);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/contas");

  if (nova) {
    redirect("/dashboard");
  }
  redirect("/dashboard/contas");
}
