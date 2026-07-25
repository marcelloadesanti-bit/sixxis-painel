"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { podeEditar, type PermissoesUsuario } from "@/lib/permissoes";

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
    .select("role, permissoes")
    .eq("id", user.id)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";
  const permissoes = (profile?.permissoes as PermissoesUsuario) ?? {};
  if (!podeEditar(isAdmin, permissoes, "metas")) {
    throw new Error("Você não tem permissão para definir metas.");
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

// Metas de atendimento: tempo maximo (em minutos) para cada um dos 3
// indicadores de SLA. O mesmo valor e comparado com a media calculada em
// tempo real na aba Pos-venda (ver src/lib/mercadolivre/questions.ts,
// claims.ts e messages.ts).
const TIPOS_META_ATENDIMENTO = ["sla_mensagens", "sla_perguntas", "tempo_reclamacoes"] as const;

export async function definirMetaAtendimentoAction(formData: FormData) {
  const ano = Number(formData.get("ano"));
  const mes = Number(formData.get("mes"));

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
  if (!podeEditar(isAdmin, permissoes, "metas")) {
    throw new Error("Você não tem permissão para definir metas.");
  }

  if (!ano || !mes || mes < 1 || mes > 12) {
    throw new Error("Informe ano e mês válidos.");
  }

  const linhas: { ano: number; mes: number; tipo_meta: string; valor_minutos: number; atualizado_em: string }[] = [];
  for (const tipo of TIPOS_META_ATENDIMENTO) {
    const horas = Number(formData.get(`${tipo}_horas`) ?? 0);
    const minutos = Number(formData.get(`${tipo}_minutos`) ?? 0);
    const totalMinutos = horas * 60 + minutos;
    if (totalMinutos > 0) {
      linhas.push({ ano, mes, tipo_meta: tipo, valor_minutos: totalMinutos, atualizado_em: new Date().toISOString() });
    }
  }

  if (linhas.length === 0) {
    throw new Error("Informe pelo menos uma meta de atendimento válida.");
  }

  const { error } = await supabase
    .from("metas_atendimento")
    .upsert(linhas, { onConflict: "ano,mes,tipo_meta" });

  if (error) {
    throw new Error(`Falha ao salvar meta de atendimento: ${error.message}`);
  }

  revalidatePath("/dashboard/configuracoes/metas");
  revalidatePath("/dashboard/pos-venda");
  redirect("/dashboard/configuracoes/metas?salvo=2");
}
