"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { nomeConta, COR_PADRAO } from "@/lib/account-colors";
import {
  buscarBenchmarksDaConta,
  buscarCategoriasVendedor,
  buscarMaisVendidosCategoria,
  type BenchmarkItem,
  type CategoriaVendedor,
  type ItemMaisVendido,
} from "@/lib/mercadolivre/concorrencia";

async function exigirAcesso() {
  await exigirAcessoSecao("concorrencia");
}

type ContaResumo = { id: string; ml_user_id: string; nickname: string; cor: string; siteId: string };

async function listarContas(): Promise<ContaResumo[]> {
  const admin = createAdminClient();
  const { data } = await admin.from("ml_accounts").select("id, ml_user_id, nickname, apelido, cor, site_id");
  return (data ?? []).map((c: any) => ({
    id: c.id as string,
    ml_user_id: String(c.ml_user_id),
    nickname: nomeConta({ nickname: c.nickname as string, apelido: c.apelido as string | null }),
    cor: (c.cor as string) ?? COR_PADRAO,
    siteId: (c.site_id as string) ?? "MLB",
  }));
}

// Bulk detail (titulo/thumbnail/permalink) de itens NOSSOS -- o endpoint de
// benchmark so devolve o item_id, entao completamos com /items?ids=.
async function buscarTitulosBulk(
  accessToken: string,
  ids: string[]
): Promise<Map<string, { titulo: string; thumbnail: string; permalink: string }>> {
  const mapa = new Map<string, { titulo: string; thumbnail: string; permalink: string }>();
  for (let i = 0; i < ids.length; i += 20) {
    const lote = ids.slice(i, i + 20);
    try {
      const resp = await fetch(`https://api.mercadolibre.com/items?ids=${lote.join(",")}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) continue;
      const data = await resp.json();
      for (const entrada of data) {
        if (entrada.code === 200 && entrada.body) {
          mapa.set(entrada.body.id, {
            titulo: entrada.body.title,
            thumbnail: (entrada.body.thumbnail ?? "").replace("http://", "https://"),
            permalink: entrada.body.permalink,
          });
        }
      }
    } catch {
      // ignora lote com erro, segue com os demais
    }
  }
  return mapa;
}

export type LinhaBenchmark = BenchmarkItem & {
  contaId: string;
  contaNickname: string;
  contaCor: string;
  titulo: string;
  thumbnail: string;
  permalink: string;
};

// Benchmark de preco oficial do ML para os anuncios nossos que tem
// referencia calculada, consolidado nas contas conectadas.
export async function buscarBenchmarksAction(): Promise<LinhaBenchmark[]> {
  await exigirAcesso();
  const contas = await listarContas();
  const resultados: LinhaBenchmark[] = [];

  await Promise.all(
    contas.map(async (conta) => {
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const itens = await buscarBenchmarksDaConta(accessToken, conta.ml_user_id, 30);
        const titulos = await buscarTitulosBulk(
          accessToken,
          itens.map((i) => i.itemId)
        );
        for (const item of itens) {
          const info = titulos.get(item.itemId);
          resultados.push({
            ...item,
            contaId: conta.id,
            contaNickname: conta.nickname,
            contaCor: conta.cor,
            titulo: info?.titulo ?? item.itemId,
            thumbnail: info?.thumbnail ?? "",
            permalink: info?.permalink ?? "",
          });
        }
      } catch (err) {
        console.error(`Erro ao buscar benchmark da conta ${conta.id}:`, err);
      }
    })
  );

  // Prioriza os que estao com preco acima da concorrencia (mais acionavel).
  const prioridade: Record<string, number> = {
    with_benchmark_highest: 0,
    with_benchmark_high: 1,
    no_benchmark_ok: 2,
    no_benchmark_lowest: 3,
  };
  resultados.sort((a, b) => (prioridade[a.status] ?? 9) - (prioridade[b.status] ?? 9));

  return resultados;
}

export type CategoriaConsolidada = CategoriaVendedor & { contaIds: string[] };

// Categorias em que vendemos, consolidadas nas contas conectadas -- usada
// pra montar o seletor da aba "Mais Vendidos por Categoria".
export async function listarCategoriasAction(): Promise<CategoriaConsolidada[]> {
  await exigirAcesso();
  const contas = await listarContas();
  const mapa = new Map<string, CategoriaConsolidada>();

  await Promise.all(
    contas.map(async (conta) => {
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const categorias = await buscarCategoriasVendedor(accessToken, conta.ml_user_id);
        for (const c of categorias) {
          const existente = mapa.get(c.categoriaId);
          if (existente) {
            existente.quantidadeAnuncios += c.quantidadeAnuncios;
            if (!existente.contaIds.includes(conta.id)) existente.contaIds.push(conta.id);
          } else {
            mapa.set(c.categoriaId, { ...c, contaIds: [conta.id] });
          }
        }
      } catch (err) {
        console.error(`Erro ao buscar categorias da conta ${conta.id}:`, err);
      }
    })
  );

  return Array.from(mapa.values()).sort((a, b) => b.quantidadeAnuncios - a.quantidadeAnuncios);
}

// Top 20 mais vendidos de uma categoria (qualquer conta serve para
// autenticar -- o ranking e do site, nao especifico do vendedor).
export async function buscarMaisVendidosAction(categoriaId: string): Promise<ItemMaisVendido[]> {
  await exigirAcesso();
  const contas = await listarContas();
  const primeira = contas[0];
  if (!primeira) return [];
  const accessToken = await getValidAccessToken(primeira.id);
  return buscarMaisVendidosCategoria(accessToken, primeira.siteId, categoriaId);
}
