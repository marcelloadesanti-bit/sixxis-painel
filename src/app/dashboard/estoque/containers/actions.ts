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

// Fase 14b (04/08/2026): um pedido pode trazer mais de um produto no mesmo
// container -- o formulario manda arrays paralelos sku[]/quantidade[] (uma
// linha por item adicionado pelo usuario). Cada item vira uma linha propria
// em estoque_containers, todas compartilhando fatura/fornecedor/datas/
// pagamento/observacoes do pedido.
type ItemPedido = { sku: string; quantidade: number };

function extrairItens(formData: FormData): ItemPedido[] {
  const skus = formData.getAll("sku").map((v) => String(v).trim().toUpperCase());
  const quantidades = formData.getAll("quantidade").map((v) => Number(v) || 0);
  const itens: ItemPedido[] = [];
  for (let i = 0; i < skus.length; i++) {
    if (skus[i] && quantidades[i] > 0) {
      itens.push({ sku: skus[i], quantidade: quantidades[i] });
    }
  }
  return itens;
}

function camposCompartilhados(formData: FormData, fornecedor: string) {
  return {
    fatura: valorOuNull(formData, "fatura"),
    fornecedor,
    // Fase 14 (04/08/2026): vinculo opcional com o cadastro de fornecedores.
    // Fica nulo quando o pedido usa o fallback manual (fornecedor digitado
    // livremente em vez de selecionado no dropdown).
    fornecedor_id: valorOuNull(formData, "fornecedorId"),
    data_embarque: valorOuNull(formData, "dataEmbarque"),
    data_prev_chegada: valorOuNull(formData, "dataPrevChegada"),
    data_chegada: valorOuNull(formData, "dataChegada"),
    pago: formData.get("pago") === "on",
    observacoes: valorOuNull(formData, "observacoes"),
  };
}

export async function criarContainerAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const fornecedor = String(formData.get("fornecedor") ?? "").trim();
  const itens = extrairItens(formData);
  if (!fornecedor || itens.length === 0) return;

  const compartilhados = camposCompartilhados(formData, fornecedor);

  await supabase
    .from("estoque_containers")
    .insert(itens.map((item) => ({ ...compartilhados, sku: item.sku, quantidade: item.quantidade })));

  revalidarPaginas();
}

export async function atualizarContainerAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const fornecedor = String(formData.get("fornecedor") ?? "").trim();
  const itens = extrairItens(formData);
  if (!fornecedor || itens.length === 0) return;

  const compartilhados = camposCompartilhados(formData, fornecedor);
  const [primeiro, ...extras] = itens;

  // O primeiro item atualiza a linha existente (mesmo id). Itens extras
  // adicionados durante a edicao (pedido que ganhou mais um SKU depois de
  // cadastrado) viram novas linhas -- efetivamente "dividindo" o container
  // em mais de uma linha, todas compartilhando os mesmos dados de pedido.
  await supabase
    .from("estoque_containers")
    .update({ ...compartilhados, sku: primeiro.sku, quantidade: primeiro.quantidade })
    .eq("id", id);

  if (extras.length > 0) {
    await supabase
      .from("estoque_containers")
      .insert(extras.map((item) => ({ ...compartilhados, sku: item.sku, quantidade: item.quantidade })));
  }

  revalidarPaginas();
}

export async function excluirContainerAction(formData: FormData) {
  const supabase = await exigirEdicao();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  await supabase.from("estoque_containers").delete().eq("id", id);

  revalidarPaginas();
}
