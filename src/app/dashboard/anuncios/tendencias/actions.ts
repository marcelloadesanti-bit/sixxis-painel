"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import {
  buscarCategoriasRaiz,
  buscarCategoria,
  buscarPredicaoCategoria,
  type CategoriaResumo,
  type CategoriaDetalhe,
} from "@/lib/mercadolivre/categorias";
import {
  buscarTendenciasSite,
  buscarTendenciasCategoria,
  buscarDadosCompetitivos,
  type TermoTendencia,
  type DadosCompetitivos,
} from "@/lib/mercadolivre/tendencias";

async function exigirAcesso() {
  await exigirAcessoSecao("anuncios", "tendencias_busca");
}

// Tendencias sao dado de referencia do site (nao variam por vendedor),
// entao qualquer conta conectada serve para autenticar a chamada.
async function tokenDeQualquerConta(): Promise<string> {
  const admin = createAdminClient();
  const { data: contas } = await admin.from("ml_accounts").select("id").limit(1);
  const conta = contas?.[0];
  if (!conta) throw new Error("Nenhuma conta do Mercado Livre conectada.");
  return getValidAccessToken(conta.id as string);
}

export async function buscarCategoriasRaizAction(): Promise<CategoriaResumo[]> {
  await exigirAcesso();
  const accessToken = await tokenDeQualquerConta();
  return buscarCategoriasRaiz(accessToken);
}

export async function buscarCategoriaAction(categoriaId: string): Promise<CategoriaDetalhe> {
  await exigirAcesso();
  const accessToken = await tokenDeQualquerConta();
  return buscarCategoria(accessToken, categoriaId);
}

export async function buscarTendenciasSiteAction(): Promise<TermoTendencia[]> {
  await exigirAcesso();
  const accessToken = await tokenDeQualquerConta();
  return buscarTendenciasSite(accessToken);
}

export async function buscarTendenciasCategoriaAction(categoriaId: string): Promise<TermoTendencia[]> {
  await exigirAcesso();
  const accessToken = await tokenDeQualquerConta();
  return buscarTendenciasCategoria(accessToken, categoriaId);
}

export type ResultadoPesquisaProduto = {
  categoriaSugerida: { id: string; nome: string; dominio: string } | null;
  tendenciasCategoria: TermoTendencia[];
  posicaoDoTermo: number | null; // posicao do termo pesquisado no top 50, se aparecer
  competitivo: DadosCompetitivos;
};

// Combina predicao de categoria (mesmo mecanismo usado na criacao de
// anuncio) + tendencias dessa categoria + retrato competitivo do termo
// exato pesquisado -- para nunca devolver uma tela vazia, mesmo quando o
// termo nao esta no top 50 de tendencias.
export async function pesquisarProdutoAction(termo: string): Promise<ResultadoPesquisaProduto> {
  await exigirAcesso();
  const termoLimpo = termo.trim();
  if (!termoLimpo) {
    throw new Error("Digite um termo para pesquisar.");
  }
  const accessToken = await tokenDeQualquerConta();

  const [sugestoes, competitivo] = await Promise.all([
    buscarPredicaoCategoria(accessToken, termoLimpo),
    buscarDadosCompetitivos(accessToken, termoLimpo),
  ]);

  const sugestao = sugestoes[0] ?? null;
  let tendenciasCategoria: TermoTendencia[] = [];
  if (sugestao) {
    try {
      tendenciasCategoria = await buscarTendenciasCategoria(accessToken, sugestao.categoriaId);
    } catch {
      tendenciasCategoria = [];
    }
  }

  const termoNormalizado = termoLimpo.toLowerCase();
  const match = tendenciasCategoria.find((t) => t.termo.toLowerCase().includes(termoNormalizado));

  return {
    categoriaSugerida: sugestao
      ? { id: sugestao.categoriaId, nome: sugestao.categoriaNome, dominio: sugestao.dominioNome }
      : null,
    tendenciasCategoria,
    posicaoDoTermo: match?.posicao ?? null,
    competitivo,
  };
}
