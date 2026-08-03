"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { podeEditar as podeEditarSecao } from "@/lib/permissoes";
import { CATEGORIAS_FORNECEDOR, type CategoriaFornecedor } from "@/lib/fornecedores";

// Mesmo padrao de guarda usado no restante do painel: exige nivel "edicao"
// na secao "fornecedores".
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
  const podeEditar = podeEditarSecao(isAdmin, profile?.permissoes ?? {}, "fornecedores");
  if (!podeEditar) throw new Error("Sem permissao para editar Fornecedores.");

  return supabase;
}

function valorOuNull(formData: FormData, campo: string): string | null {
  const v = String(formData.get(campo) ?? "").trim();
  return v || null;
}

function categoriaValida(formData: FormData): CategoriaFornecedor {
  const v = String(formData.get("categoria") ?? "");
  return (CATEGORIAS_FORNECEDOR as readonly string[]).includes(v) ? (v as CategoriaFornecedor) : "Outros";
}

function revalidarPaginas() {
  revalidatePath("/dashboard/fornecedores");
  revalidatePath("/dashboard/estoque/containers");
}

export async function criarFornecedorAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return;

  await supabase.from("fornecedores").insert({
    categoria: categoriaValida(formData),
    nome,
    localizacao: valorOuNull(formData, "localizacao"),
    cnpj: valorOuNull(formData, "cnpj"),
    representante_comercial: valorOuNull(formData, "representanteComercial"),
    linha_produtos: valorOuNull(formData, "linhaProdutos"),
    ativo: formData.get("ativo") === "on",
  });

  revalidarPaginas();
}

export async function atualizarFornecedorAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return;

  await supabase
    .from("fornecedores")
    .update({
      categoria: categoriaValida(formData),
      nome,
      localizacao: valorOuNull(formData, "localizacao"),
      cnpj: valorOuNull(formData, "cnpj"),
      representante_comercial: valorOuNull(formData, "representanteComercial"),
      linha_produtos: valorOuNull(formData, "linhaProdutos"),
      ativo: formData.get("ativo") === "on",
    })
    .eq("id", id);

  revalidarPaginas();
}

// Alterna ativo/inativo direto na listagem, sem precisar abrir o form de
// edicao completo -- e a acao mais usada no dia a dia (desativar um
// fornecedor que parou de fornecer, sem apagar o cadastro).
export async function alternarAtivoFornecedorAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const ativo = formData.get("ativo") === "true";

  await supabase.from("fornecedores").update({ ativo: !ativo }).eq("id", id);

  revalidarPaginas();
}

export async function excluirFornecedorAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await supabase.from("fornecedores").delete().eq("id", id);

  revalidarPaginas();
}
