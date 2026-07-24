"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { podeEditar as temPermissaoEdicao } from "@/lib/permissoes";
import {
  buscarCategoriasRaiz,
  buscarCategoria,
  buscarAtributosCategoria,
  buscarPredicaoCategoria,
  buscarTiposAnuncio,
  uploadImagemML,
  criarItemML,
  type CategoriaDetalhe,
  type AtributoCategoria,
  type SugestaoCategoria,
  type TipoAnuncio,
  type VariacaoPayload,
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

// Qualquer conta conectada serve para consultar a arvore de categorias,
// atributos e tarifas de referencia: esses dados sao do site (Brasil) e nao
// variam por vendedor (a tarifa exibida e uma estimativa -- pode haver
// pequena variacao por conta conforme o nivel de reputacao/MercadoLider).
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

export async function predizerCategoriaAction(titulo: string): Promise<SugestaoCategoria[]> {
  await exigirEdicaoAnuncios();
  if (!titulo || titulo.trim().length < 4) return [];
  const accessToken = await tokenDeQualquerConta();
  return buscarPredicaoCategoria(accessToken, titulo.trim());
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

export async function buscarTiposAnuncioAction(categoriaId: string, preco: number): Promise<TipoAnuncio[]> {
  await exigirEdicaoAnuncios();
  if (!categoriaId || !preco || preco <= 0) return [];
  const accessToken = await tokenDeQualquerConta();
  return buscarTiposAnuncio(accessToken, categoriaId, preco);
}

export type ResultadoContaCriacao = {
  contaId: string;
  contaNickname: string;
  ok: boolean;
  itemId?: string;
  erro?: string;
};

type VariacaoEntrada = {
  atributoId: string;
  valorId?: string;
  valorNome?: string;
  estoque: number;
  sku?: string;
  gtin?: string;
};

export async function criarAnuncioAction(formData: FormData): Promise<{
  resultados: ResultadoContaCriacao[];
}> {
  await exigirEdicaoAnuncios();

  const titulo = String(formData.get("titulo") ?? "").trim();
  const categoriaId = String(formData.get("categoriaId") ?? "");
  const preco = Number(formData.get("preco"));
  const descricao = String(formData.get("descricao") ?? "");
  const freteGratis = formData.get("freteGratis") === "on";
  const tipoAnuncio = String(formData.get("tipoAnuncio") ?? "gold_special");
  const contaIds = String(formData.get("contaIds") ?? "")
    .split(",")
    .filter(Boolean);
  const atributosJson = String(formData.get("atributosJson") ?? "[]");
  const atributos = JSON.parse(atributosJson) as { id: string; value_name?: string; value_id?: string }[];

  const temVariacoes = formData.get("temVariacoes") === "on";

  if (!titulo || !categoriaId || !preco || contaIds.length === 0) {
    throw new Error("Preencha título, categoria, preço e selecione ao menos uma conta.");
  }

  const admin = createAdminClient();
  const { data: contasRaw } = await admin
    .from("ml_accounts")
    .select("id, nickname")
    .in("id", contaIds);
  const contas = contasRaw ?? [];

  const resultados: ResultadoContaCriacao[] = [];

  // --- caminho sem variacoes: um unico estoque/sku/gtin/fotos ---
  let estoqueSimples = 0;
  let skuSimples = "";
  let gtinSimples = "";
  let imagensSimples: File[] = [];

  // --- caminho com variacoes: uma linha por combinacao ---
  let variacoesEntrada: VariacaoEntrada[] = [];
  let atributoVariacaoId = "";
  const imagensPorVariacao = new Map<number, File[]>();

  if (temVariacoes) {
    const variacoesJson = String(formData.get("variacoesJson") ?? "[]");
    variacoesEntrada = JSON.parse(variacoesJson) as VariacaoEntrada[];
    atributoVariacaoId = String(formData.get("atributoVariacaoId") ?? "");
    if (!atributoVariacaoId || variacoesEntrada.length === 0) {
      throw new Error("Configure ao menos uma variação (ex.: Cor) com seus valores.");
    }
    variacoesEntrada.forEach((_, i) => {
      const imgs = formData.getAll(`imagens_${i}`).filter((f): f is File => f instanceof File && f.size > 0);
      imagensPorVariacao.set(i, imgs);
      if (imgs.length === 0) {
        throw new Error(`Adicione ao menos uma foto para a variação "${variacoesEntrada[i].valorNome ?? variacoesEntrada[i].valorId}".`);
      }
    });
  } else {
    estoqueSimples = Number(formData.get("estoque"));
    skuSimples = String(formData.get("sku") ?? "").trim();
    gtinSimples = String(formData.get("gtin") ?? "").trim();
    imagensSimples = formData.getAll("imagens").filter((f): f is File => f instanceof File && f.size > 0);
    if (!estoqueSimples || estoqueSimples < 0) {
      throw new Error("Informe o estoque.");
    }
    if (imagensSimples.length === 0) {
      throw new Error("Adicione ao menos uma foto.");
    }
  }

  for (const conta of contas) {
    const contaId = conta.id as string;
    const contaNickname = conta.nickname as string;
    try {
      const accessToken = await getValidAccessToken(contaId);

      if (temVariacoes) {
        // fotos precisam ser enviadas para a biblioteca de CADA conta (o id
        // de imagem retornado pelo upload nao e compartilhavel entre vendedores)
        const variacoesPayload: VariacaoPayload[] = [];
        for (let i = 0; i < variacoesEntrada.length; i++) {
          const linha = variacoesEntrada[i];
          const imgsOriginais = imagensPorVariacao.get(i) ?? [];
          const fotosIds: string[] = [];
          for (const img of imgsOriginais) {
            fotosIds.push(await uploadImagemML(accessToken, img));
          }
          variacoesPayload.push({
            combinacao: [{ id: atributoVariacaoId, valorId: linha.valorId, valorNome: linha.valorNome }],
            estoque: linha.estoque,
            sku: linha.sku,
            gtin: linha.gtin,
            fotosIds,
          });
        }

        const itemId = await criarItemML(accessToken, {
          titulo,
          categoriaId,
          preco,
          moeda: "BRL",
          descricao,
          atributos,
          freteGratis,
          tipoAnuncio,
          variacoes: variacoesPayload,
        });
        resultados.push({ contaId, contaNickname, ok: true, itemId });
      } else {
        const fotosIds: string[] = [];
        for (const imagem of imagensSimples) {
          fotosIds.push(await uploadImagemML(accessToken, imagem));
        }

        const itemId = await criarItemML(accessToken, {
          titulo,
          categoriaId,
          preco,
          moeda: "BRL",
          descricao,
          atributos,
          freteGratis,
          tipoAnuncio,
          estoque: estoqueSimples,
          sku: skuSimples || undefined,
          gtin: gtinSimples || undefined,
          fotosIds,
        });
        resultados.push({ contaId, contaNickname, ok: true, itemId });
      }
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
