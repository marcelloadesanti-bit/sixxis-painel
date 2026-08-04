"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { podeEditar as podeEditarSecao } from "@/lib/permissoes";
import { CATEGORIAS_FORNECEDOR, type CategoriaFornecedor } from "@/lib/fornecedores";
import { geocodificarEndereco } from "@/lib/geocoding";

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

// O form envia um <input type="hidden" name="skus"> por chip (um por SKU
// digitado no CampoSkus). Normaliza para maiusculo/trim e remove
// duplicados -- convencao (Fase 16, 04/08/2026) e cadastrar o SKU "pai" sem
// sufixo de voltagem (ex: CLI-SX040 em vez de CLI-SX040-110/-220).
function skusValidos(formData: FormData): string[] {
  const brutos = formData.getAll("skus").map((v) => String(v).trim().toUpperCase());
  return Array.from(new Set(brutos.filter(Boolean)));
}

function revalidarPaginas() {
  revalidatePath("/dashboard/fornecedores");
  revalidatePath("/dashboard/estoque/containers");
}

export async function criarFornecedorAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return;

  const localizacao = valorOuNull(formData, "localizacao");
  // Geocodifica no momento do cadastro -- se a Geocoding API ainda nao
  // estiver disponivel (chave/faturamento pendente), coords vem null e o
  // fornecedor e criado normalmente, so sem pino no mapa por enquanto.
  const coords = localizacao ? await geocodificarEndereco(localizacao) : null;

  await supabase.from("fornecedores").insert({
    categoria: categoriaValida(formData),
    nome,
    telefone: valorOuNull(formData, "telefone"),
    localizacao,
    cnpj: valorOuNull(formData, "cnpj"),
    representante_comercial: valorOuNull(formData, "representanteComercial"),
    linha_produtos: valorOuNull(formData, "linhaProdutos"),
    skus: skusValidos(formData),
    ativo: formData.get("ativo") === "on",
    estrela: formData.get("estrela") === "on",
    latitude: coords?.latitude ?? null,
    longitude: coords?.longitude ?? null,
    geocodificado_em: coords ? new Date().toISOString() : null,
  });

  revalidarPaginas();
}

export async function atualizarFornecedorAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const nome = String(formData.get("nome") ?? "").trim();
  if (!nome) return;

  const localizacao = valorOuNull(formData, "localizacao");
  const coords = localizacao ? await geocodificarEndereco(localizacao) : null;

  const atualizacao: Record<string, unknown> = {
    categoria: categoriaValida(formData),
    nome,
    telefone: valorOuNull(formData, "telefone"),
    localizacao,
    cnpj: valorOuNull(formData, "cnpj"),
    representante_comercial: valorOuNull(formData, "representanteComercial"),
    linha_produtos: valorOuNull(formData, "linhaProdutos"),
    skus: skusValidos(formData),
    ativo: formData.get("ativo") === "on",
    estrela: formData.get("estrela") === "on",
  };

  // So sobrescreve latitude/longitude quando a geocodificacao funcionou
  // dessa vez -- se a API estiver indisponivel (ou o endereco nao for
  // encontrado), preserva a coordenada que ja existia em vez de apagar um
  // pino valido do mapa.
  if (coords) {
    atualizacao.latitude = coords.latitude;
    atualizacao.longitude = coords.longitude;
    atualizacao.geocodificado_em = new Date().toISOString();
  }

  await supabase.from("fornecedores").update(atualizacao).eq("id", id);

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

// Alterna a marcacao de "estrela" (melhores fornecedores -- normalmente os
// que ja importamos em grande escala) direto na listagem.
export async function alternarEstrelaFornecedorAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const estrela = formData.get("estrela") === "true";

  await supabase.from("fornecedores").update({ estrela: !estrela }).eq("id", id);

  revalidarPaginas();
}

// Re-geocodifica a localizacao atual de um fornecedor ja cadastrado, sem
// precisar abrir o formulario de edicao. Usado tanto para "puxar" para o
// mapa fornecedores cadastrados antes da integracao com o Maps existir,
// quanto para tentar de novo caso a geocodificacao tenha falhado da
// primeira vez (ex: API ainda nao habilitada no momento do cadastro).
export async function atualizarLocalizacaoFornecedorAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const { data: fornecedor } = await supabase
    .from("fornecedores")
    .select("localizacao")
    .eq("id", id)
    .maybeSingle();

  const localizacao = fornecedor?.localizacao?.trim();
  if (!localizacao) return;

  const coords = await geocodificarEndereco(localizacao);
  if (!coords) return;

  await supabase
    .from("fornecedores")
    .update({
      latitude: coords.latitude,
      longitude: coords.longitude,
      geocodificado_em: new Date().toISOString(),
    })
    .eq("id", id);

  revalidarPaginas();
}

export async function excluirFornecedorAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await supabase.from("fornecedores").delete().eq("id", id);

  revalidarPaginas();
}
