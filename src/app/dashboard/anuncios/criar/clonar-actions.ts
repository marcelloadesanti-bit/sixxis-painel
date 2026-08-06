"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nomeConta, COR_PADRAO } from "@/lib/account-colors";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { podeEditar as temPermissaoEdicao } from "@/lib/permissoes";
import { buscarTiposAnuncio, type TipoAnuncio } from "@/lib/mercadolivre/categorias";
import {
    buscarItemParaClonagem,
    clonarItemML,
    listarAnunciosParaPicker,
    type ItemParaClonagem,
    type AnuncioPicker,
    type OverridesClonagem,
} from "@/lib/mercadolivre/clonagem";
import type { ResultadoContaCriacao } from "./actions";

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

// Qualquer conta conectada serve para consultar tarifas de referencia (dado
// do site, nao do vendedor) -- mesmo padrao usado na criacao do zero.
async function tokenDeQualquerConta(): Promise<string> {
    const admin = createAdminClient();
    const { data: contas } = await admin.from("ml_accounts").select("id").limit(1);
    const conta = contas?.[0];
    if (!conta) throw new Error("Nenhuma conta do Mercado Livre conectada.");
    return getValidAccessToken(conta.id as string);
}

export type ContaClonagem = { id: string; nickname: string; cor: string };

export async function listarContasClonagemAction(): Promise<ContaClonagem[]> {
    await exigirEdicaoAnuncios();
    const admin = createAdminClient();
    const { data } = await admin
      .from("ml_accounts")
      .select("id, nickname, apelido, cor")
      .order("nickname", { ascending: true });
    return (data ?? []).map((c) => ({
          id: c.id as string,
          nickname: nomeConta({ nickname: c.nickname as string, apelido: c.apelido as string | null }),
          cor: (c.cor as string) ?? COR_PADRAO,
    }));
}

// Lista leve dos anuncios ativos de uma conta, para o seletor "qual anuncio
// clonar" -- busca ate 100 anuncios (paginado internamente).
export async function listarAnunciosParaClonarAction(contaId: string): Promise<AnuncioPicker[]> {
    await exigirEdicaoAnuncios();
    const admin = createAdminClient();
    const { data: conta } = await admin.from("ml_accounts").select("ml_user_id").eq("id", contaId).maybeSingle();
    if (!conta) throw new Error("Conta não encontrada.");
    const accessToken = await getValidAccessToken(contaId);
    return listarAnunciosParaPicker(accessToken, conta.ml_user_id as string);
}

// Detalhe completo do anuncio escolhido (para a previa e para os campos
// editaveis do modo "editavel").
export async function buscarPreviewClonagemAction(contaOrigemId: string, itemId: string): Promise<ItemParaClonagem> {
    await exigirEdicaoAnuncios();
    const accessToken = await getValidAccessToken(contaOrigemId);
    return buscarItemParaClonagem(accessToken, itemId);
}

// Mesmo calculo de tarifas Classico/Premium usado na criacao do zero --
// reaproveitado no modo "editavel" quando o usuario altera o preco.
export async function buscarTiposAnuncioClonagemAction(categoriaId: string, preco: number): Promise<TipoAnuncio[]> {
    await exigirEdicaoAnuncios();
    if (!categoriaId || !preco || preco <= 0) return [];
    const accessToken = await tokenDeQualquerConta();
    return buscarTiposAnuncio(accessToken, categoriaId, preco);
}

// Executa a clonagem em si: busca o anuncio de origem uma unica vez e cria
// uma copia em cada conta de destino selecionada. No modo "copia simples"
// (overrides ausente) publica exatamente como esta no anuncio original; no
// modo "editavel" aplica os ajustes revisados pelo usuario antes de publicar.
export async function clonarAnuncioAction(input: {
    contaOrigemId: string;
    itemId: string;
    contasDestinoIds: string[];
    overrides?: OverridesClonagem;
}): Promise<{ resultados: ResultadoContaCriacao[] }> {
    await exigirEdicaoAnuncios();

  if (!input.contaOrigemId || !input.itemId) {
        throw new Error("Selecione o anúncio de origem.");
  }
    if (!input.contasDestinoIds || input.contasDestinoIds.length === 0) {
          throw new Error("Selecione ao menos uma conta de destino.");
    }

  const accessTokenOrigem = await getValidAccessToken(input.contaOrigemId);
    const origem = await buscarItemParaClonagem(accessTokenOrigem, input.itemId);

  const admin = createAdminClient();
    const { data: contasRaw } = await admin
      .from("ml_accounts")
      .select("id, nickname, apelido")
      .in("id", input.contasDestinoIds);
    const contas = contasRaw ?? [];

  const resultados: ResultadoContaCriacao[] = [];
    for (const conta of contas) {
          const contaId = conta.id as string;
          const contaNickname = nomeConta({ nickname: conta.nickname as string, apelido: conta.apelido as string | null });
          try {
                  const accessTokenDestino = await getValidAccessToken(contaId);
                  const itemId = await clonarItemML(accessTokenDestino, origem, input.overrides);
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
