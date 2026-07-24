"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { podeEditar as temPermissaoEdicao } from "@/lib/permissoes";
import {
  buscarCategoriasRaiz,
  buscarCategoria,
  buscarAtributosCategoria,
  uploadImagemML,
  criarItemML,
  type CategoriaDetalhe,
  type AtributoCategoria,
} from "@/lib/mercadolivre/categorias";

async function exigirEdicaoAnuncios() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, permissoes")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin";
  if (!temPermissaoEdicao(isAdmin, profile?.permissoes ?? {}, "anuncios")) {
    throw new Error("Seu acesso a Anúncios é somente leitura.");
  }
}

// Qualquer conta conectada serve para consultar a arvore de categorias e
// atributos: esses dados sao do site (Brasil) e nao variam por vendedor.
async function tokenDeQualquerConta(): Promise<string> {
  const admin = createAdminClient();
  const { data: contas } = await admin.from("ml_accounts").select("id").limit(1);
  const conta = contas?.[0];
  if (!conta) throw new Error("Nenhuma conta do Mercado Livre conectada.");
  return getValidAccessToken(conta.id as string);
}

export async function buscarCategoriasRaizAction(): Promise<{ id: string; name: string }[]> {
  await exigirEdicaoAnuncios();
  const accessToken = await tokenDeQualquerConta();
  return buscarCategoriasRaiz(accessToken);
}

export async function buscarCategoriaAction(categoriaId: string): Promise<CategoriaDetalhe> {
  await exigirEdicaoAnuncios();
  const accessToken = await tokenDeQualquerConta();
  return buscarCategoria(accessToken, categoriaId);
}

export async function buscarAtributosAction(categoriaId: string): Promise<AtributoCategoria[]> {
  await exigirEdicaoAnuncios();
  const accessToken = await tokenDeQualquerConta();
  return buscarAtributosCategoria(accessToken, categoriaId);
}

export type ResultadoContaCriacao = {
  contaId: string;
  contaNickname: string;
  ok: boolean;
  itemId?: string;
  erro?: string;
};

export async function criarAnuncioAction(formData: FormData): Promise<{
  resultados: ResultadoContaCriacao[];
}> {
  await exigirEdicaoAnuncios();

  const titulo = String(formData.get("titulo") ?? "").trim();
  const categoriaId = String(formData.get("categoriaId") ?? "");
  const preco = Number(formData.get("preco"));
  const estoque = Number(formData.get("estoque"));
  const descricao = String(formData.get("descricao") ?? "");
  const freteGratis = formData.get("freteGratis") === "on";
  const contaIds = String(formData.get("contaIds") ?? "")
    .split(",")
    .filter(Boolean);
  const atributosJson = String(formData.get("atributosJson") ?? "[]");
  const atributos = JSON.parse(atributosJson) as { id: string; value_name: string }[];
  const imagens = formData.getAll("imagens").filter((f): f is File => f instanceof File && f.size > 0);

  if (!titulo || !categoriaId || !preco || !estoque || contaIds.length === 0) {
    throw new Error("Preencha título, categoria, preço, estoque e selecione ao menos uma conta.");
  }
  if (imagens.length === 0) {
    throw new Error("Adicione ao menos uma foto.");
  }

  const admin = createAdminClient();
  const { data: contasRaw } = await admin
    .from("ml_accounts")
    .select("id, nickname")
    .in("id", contaIds);
  const contas = contasRaw ?? [];

  const resultados: ResultadoContaCriacao[] = [];

  for (const conta of contas) {
    const contaId = conta.id as string;
    const contaNickname = conta.nickname as string;
    try {
      const accessToken = await getValidAccessToken(contaId);

      // fotos precisam ser enviadas para a biblioteca de CADA conta (o id de
      // imagem retornado pelo upload nao e compartilhavel entre vendedores)
      const fotosIds: string[] = [];
      for (const imagem of imagens) {
        const id = await uploadImagemML(accessToken, imagem);
        fotosIds.push(id);
      }

      const itemId = await criarItemML(accessToken, {
        titulo,
        categoriaId,
        preco,
        estoque,
        moeda: "BRL",
        descricao,
        fotosIds,
        atributos,
        freteGratis,
      });

      resultados.push({ contaId, contaNickname, ok: true, itemId });
    } catch (err) {
      resultados.push({
        contaId,
        contaNickname,
        ok: false,
        erro: err instanceof Error ? err.message : "Erro desconhecido.",
      });
    }
  }

  return { resultados };
}
