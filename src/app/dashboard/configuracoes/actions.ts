"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { temAcessoSecao, podeEditar, removerPermissoesAdmin, type PermissoesUsuario } from "@/lib/permissoes";

// ---------------------------------------------------------------------------
// Modelo de seguranca de acessos (importante ler antes de mexer aqui):
//
// - "admin" (role) = admin master. So existe 1 (o Marcello). Bypassa todas as
//   checagens de permissoes e e o UNICO que pode criar/editar/excluir contas
//   com role "administrador" (via exigirMaster). Isso evita que um
//   administrador crie outro administrador com mais acesso que ele mesmo, ou
//   se autopromova.
// - "administrador" (role) = tier intermediario. Usa o MESMO objeto
//   `permissoes` (JSONB) que colaborador, mas pode receber acesso as secoes
//   administrativas (equipe/contas/metas) alem das operacionais. So o admin
//   master gerencia (cria/edita/remove) contas desse tipo.
// - "colaborador" (role) = tier operacional. Pode ser gerenciado por QUALQUER
//   pessoa com acesso de edicao a secao "equipe" (admin master OU um
//   administrador que tenha recebido essa permissao). Por seguranca, as
//   acoes de colaborador (a) nunca aceitam roles diferentes de "colaborador"
//   como alvo e (b) removem defensivamente qualquer chave de secao
//   administrativa do objeto de permissoes antes de salvar, mesmo que a UI
//   nunca ofereca essas chaves - protege contra uma requisicao manipulada.
// ---------------------------------------------------------------------------

async function exigirMaster() {
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
    throw new Error("Apenas o administrador master pode gerenciar administradores.");
  }

  return user;
}

async function exigirAcessoEquipeEdicao() {
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

  if (!temAcessoSecao(isAdmin, permissoes, "equipe") || !podeEditar(isAdmin, permissoes, "equipe")) {
    throw new Error("Você não tem permissão para gerenciar colaboradores.");
  }

  return { user, isAdmin };
}

// ---------------------------------------------------------------------------
// Colaboradores (role fixo "colaborador")
// ---------------------------------------------------------------------------

export async function criarColaboradorAction(dados: {
  nomeCompleto: string;
  email: string;
  senha: string;
  permissoes: PermissoesUsuario;
}) {
  await exigirAcessoEquipeEdicao();

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
    permissoes: removerPermissoesAdmin(dados.permissoes),
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
  await exigirAcessoEquipeEdicao();

  const admin = createAdminClient();

  // Defesa contra escalonamento: essa acao so pode alterar contas que hoje
  // sao "colaborador". Impede que alguem use o userId de um administrador ou
  // do admin master aqui (mesmo manipulando a requisicao manualmente).
  const { data: alvo } = await admin.from("profiles").select("role").eq("id", dados.userId).maybeSingle();
  if (alvo?.role !== "colaborador") {
    throw new Error("Esta ação só pode ser usada para colaboradores.");
  }

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
    .update({ full_name: nomeCompleto, permissoes: removerPermissoesAdmin(dados.permissoes) })
    .eq("id", dados.userId);

  if (erroPerfil) {
    throw new Error("Não foi possível salvar as permissões.");
  }

  revalidatePath("/dashboard/configuracoes");
}

export async function excluirColaboradorAction(userId: string) {
  await exigirAcessoEquipeEdicao();

  const admin = createAdminClient();

  const { data: alvo } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (alvo?.role !== "colaborador") {
    throw new Error("Esta ação só pode ser usada para colaboradores.");
  }

  await admin.from("profiles").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);

  revalidatePath("/dashboard/configuracoes");
}

// ---------------------------------------------------------------------------
// Administradores (role fixo "administrador") - restrito ao admin master
// ---------------------------------------------------------------------------

export async function criarAdministradorAction(dados: {
  nomeCompleto: string;
  email: string;
  senha: string;
  permissoes: PermissoesUsuario;
}) {
  await exigirMaster();

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
    role: "administrador",
    permissoes: dados.permissoes,
  });

  if (erroPerfil) {
    await admin.auth.admin.deleteUser(criado.user.id);
    throw new Error("Não foi possível salvar as permissões do administrador.");
  }

  revalidatePath("/dashboard/configuracoes");
}

export async function atualizarAdministradorAction(dados: {
  userId: string;
  nomeCompleto: string;
  permissoes: PermissoesUsuario;
  novaSenha?: string;
}) {
  const user = await exigirMaster();

  if (dados.userId === user.id) {
    throw new Error("Use as configurações da sua própria conta para alterá-la.");
  }

  const admin = createAdminClient();

  const { data: alvo } = await admin.from("profiles").select("role").eq("id", dados.userId).maybeSingle();
  if (alvo?.role !== "administrador") {
    throw new Error("Esta ação só pode ser usada para administradores.");
  }

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

export async function excluirAdministradorAction(userId: string) {
  const user = await exigirMaster();

  if (userId === user.id) {
    throw new Error("Você não pode remover a própria conta.");
  }

  const admin = createAdminClient();

  const { data: alvo } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (alvo?.role !== "administrador") {
    throw new Error("Esta ação só pode ser usada para administradores.");
  }

  await admin.from("profiles").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);

  revalidatePath("/dashboard/configuracoes");
}
