"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PermissoesUsuario } from "@/lib/permissoes";

async function exigirAdmin() {
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
    throw new Error("Apenas administradores podem gerenciar usuários.");
  }

  return user;
}

export async function criarColaboradorAction(dados: {
  nomeCompleto: string;
  email: string;
  senha: string;
  permissoes: PermissoesUsuario;
}) {
  await exigirAdmin();

  const nomeCompleto = dados.nomeCompleto.trim();
  const email = dados.email.trim().toLowerCase();
  const senha = dados.senha;

  if (!nomeCompleto || !email || senha.length < 6) {
    throw new Error("Preencha nome, e-mail e uma senha com pelo menos 6 caracteres.");
  }

  const admin = createAdminClient();

  const { data: criado, error: erroCriacao } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: nomeCompleto },
  });

  if (erroCriacao || !criado?.user) {
    if (erroCriacao?.message?.includes("already been registered")) {
      throw new Error("Já existe uma conta com esse e-mail.");
    }
    throw new Error(erroCriacao?.message ?? "Não foi possível criar o usuário.");
  }

  const { error: erroPerfil } = await admin.from("profiles").upsert({
    id: criado.user.id,
    full_name: nomeCompleto,
    role: "colaborador",
    permissoes: dados.permissoes,
  });

  if (erroPerfil) {
    // reverte a criação do usuário de auth se o perfil falhar, pra não deixar orfao
    await admin.auth.admin.deleteUser(criado.user.id);
    throw new Error("Não foi possível salvar as permissões do colaborador.");
  }

  revalidatePath("/dashboard/configuracoes");
}

export async function atualizarColaboradorAction(dados: {
  userId: string;
  nomeCompleto: string;
  permissoes: PermissoesUsuario;
  novaSenha?: string;
}) {
  await exigirAdmin();

  const admin = createAdminClient();
  const nomeCompleto = dados.nomeCompleto.trim();

  if (dados.novaSenha && dados.novaSenha.length > 0) {
    if (dados.novaSenha.length < 6) {
      throw new Error("A nova senha precisa ter pelo menos 6 caracteres.");
    }
    const { error } = await admin.auth.admin.updateUserById(dados.userId, {
      password: dados.novaSenha,
    });
    if (error) throw new Error("Não foi possível atualizar a senha.");
  }

  if (nomeCompleto) {
    await admin.auth.admin.updateUserById(dados.userId, {
      user_metadata: { full_name: nomeCompleto },
    });
  }

  const { error: erroPerfil } = await admin
    .from("profiles")
    .update({ full_name: nomeCompleto, permissoes: dados.permissoes })
    .eq("id", dados.userId);

  if (erroPerfil) {
    throw new Error("Não foi possível salvar as permissões.");
  }

  revalidatePath("/dashboard/configuracoes");
}

export async function excluirColaboradorAction(userId: string) {
  await exigirAdmin();

  const admin = createAdminClient();
  await admin.from("profiles").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);

  revalidatePath("/dashboard/configuracoes");
}
