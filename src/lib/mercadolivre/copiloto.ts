// Co-piloto de Publicidade -- motor de regras (rules engine) que cruza
// dados que o painel ja possui (campanhas/anuncios de Ads, ranking de
// vendas, qualidade de anuncio, projecao de ruptura de estoque) para gerar
// sugestoes acionaveis. Puramente decisorio: nao faz nenhuma chamada de API
// ou ao Supabase -- recebe os dados ja carregados pelo chamador (pagina da
// UI ou rota de cron) e devolve a lista de sugestoes. Isso evita duplicar
// a logica de busca que ja existe em ads.ts / qualidade.ts / orders.ts /
// estoque/metricas.ts.
//
// Categorias de sugestao (escopo fechado com o usuario em 2026-08, ver
// tasks #446-450):
// 1. aumentar_orcamento / revisar_pausar -- ROAS da campanha vs ROAS
//    objetivo configurado nela mesma (mesmo criterio do Diagnostico da
//    tabela de campanhas em Publicidade > Visao geral).
// 2. reativar_pausada -- campanha pausada que teve ROAS >= objetivo no
//    ultimo periodo filtrado.
// 3. produto_sem_campanha -- item entre os mais vendidos do periodo sem
//    nenhum anuncio patrocinado ativo.
// 4. pausar_ruptura / pausar_qualidade_critica -- cruzamento com a
//    projecao de ruptura de estoque (Estoque > Metricas, mesmo corte
//    "critico" de classificarRisco) e o score de qualidade (Central de
//    Qualidade, mesmo corte < 40 usado em corScore).

import type { QualidadeAnuncio } from "./qualidade";

export type TipoSugestao =
  | "aumentar_orcamento"
  | "revisar_pausar"
  | "reativar_pausada"
  | "produto_sem_campanha"
  | "pausar_ruptura"
  | "pausar_qualidade_critica";

export type Sugestao = {
  tipo: TipoSugestao;
  contaId: string;
  contaNome: string;
  referenciaId: string; // id da campanha (string) ou item_id do anuncio
  titulo: string;
  detalhe: string;
  urgencia: "alta" | "media";
  linkAcao: string;
  linkLabel: string;
};

// --- Formatos de entrada -- o chamador monta a partir das libs existentes ---

export type CampanhaEntrada = {
  id: number;
  nome: string;
  status: string;
  roasObjetivo: number | null;
  roas: number;
  lostShareOrcamento: number | null; // fracao 0-1, de getMetricasAvancadasCampanha
};

export type AnuncioEntrada = {
  itemId: string;
  titulo: string;
  status: string;
  campanhaId: number;
};

export type ProdutoVendidoEntrada = {
  itemId: string;
  titulo: string;
  quantidade: number;
};

export type NivelRiscoRuptura = "critico" | "atencao" | "ok" | "sem_venda";

export type RupturaEntrada = {
  diasAteRuptura: number | null;
  nivelRisco: NivelRiscoRuptura;
};

export type ContaEntrada = {
  id: string;
  nome: string;
  campanhas: CampanhaEntrada[];
  anuncios: AnuncioEntrada[];
  produtosMaisVendidos: ProdutoVendidoEntrada[];
  qualidadePorItem: Map<string, QualidadeAnuncio>;
  skuPorItem: Map<string, string>;
  rupturaPorSku: Map<string, RupturaEntrada>;
};

// --- Thresholds fixos (definidos com o usuario -- nao configuraveis pela UI) ---
const ROAS_RAZAO_BOA = 1.1;
const ROAS_RAZAO_RUIM = 0.7;
const LOST_SHARE_ORCAMENTO_MIN = 0.2;
const SCORE_QUALIDADE_CRITICO = 40; // mesmo corte de corScore() em qualidade-painel.tsx
const TOP_N_MAIS_VENDIDOS = 10;

function linkCampanha(id: number): string {
  return `https://ads.mercadolivre.com.br/product-ads/admin/campaigns/${id}/dashboard`;
}
function linkAnuncio(itemId: string, contaId: string): string {
  return `/dashboard/anuncios/gestao/${itemId}?conta=${contaId}`;
}

export function gerarSugestoesConta(conta: ContaEntrada): Sugestao[] {
  const sugestoes: Sugestao[] = [];

  // --- 1 e 2: Orcamento/ROAS e reativacao (nivel campanha) ---
  for (const c of conta.campanhas) {
    const razao = c.roasObjetivo && c.roasObjetivo > 0 ? c.roas / c.roasObjetivo : null;
    if (razao === null) continue;

    if (c.status === "active") {
      if (razao >= ROAS_RAZAO_BOA && (c.lostShareOrcamento ?? 0) >= LOST_SHARE_ORCAMENTO_MIN) {
        sugestoes.push({
          tipo: "aumentar_orcamento",
          contaId: conta.id,
          contaNome: conta.nome,
          referenciaId: String(c.id),
          titulo: `Aumentar orçamento: ${c.nome}`,
          detalhe: `ROAS ${c.roas.toFixed(2)}x está ${((razao - 1) * 100).toFixed(0)}% acima da meta (${c.roasObjetivo!.toFixed(0)}x), mas ${((c.lostShareOrcamento ?? 0) * 100).toFixed(0)}% das impressões estão sendo perdidas por orçamento limitado.`,
          urgencia: "media",
          linkAcao: linkCampanha(c.id),
          linkLabel: "Ajustar orçamento no Mercado Ads",
        });
      } else if (razao < ROAS_RAZAO_RUIM) {
        sugestoes.push({
          tipo: "revisar_pausar",
          contaId: conta.id,
          contaNome: conta.nome,
          referenciaId: String(c.id),
          titulo: `Revisar ou pausar: ${c.nome}`,
          detalhe: `ROAS ${c.roas.toFixed(2)}x está ${((1 - razao) * 100).toFixed(0)}% abaixo da meta (${c.roasObjetivo!.toFixed(0)}x) -- diagnóstico Crítico.`,
          urgencia: "alta",
          linkAcao: linkCampanha(c.id),
          linkLabel: "Revisar no Mercado Ads",
        });
      }
    } else if (razao >= 1) {
      sugestoes.push({
        tipo: "reativar_pausada",
        contaId: conta.id,
        contaNome: conta.nome,
        referenciaId: String(c.id),
        titulo: `Reativar: ${c.nome}`,
        detalhe: `Campanha pausada, mas teve ROAS ${c.roas.toFixed(2)}x no último período filtrado -- igual ou acima da meta (${c.roasObjetivo!.toFixed(0)}x).`,
        urgencia: "media",
        linkAcao: linkCampanha(c.id),
        linkLabel: "Reativar no Mercado Ads",
      });
    }
  }

  // --- 3: Produtos mais vendidos sem campanha ativa ---
  const itemIdsComCampanhaAtiva = new Set(
    conta.anuncios.filter((a) => a.status === "active").map((a) => a.itemId)
  );
  for (const p of conta.produtosMaisVendidos.slice(0, TOP_N_MAIS_VENDIDOS)) {
    if (!itemIdsComCampanhaAtiva.has(p.itemId)) {
      sugestoes.push({
        tipo: "produto_sem_campanha",
        contaId: conta.id,
        contaNome: conta.nome,
        referenciaId: p.itemId,
        titulo: `Sem Ads: ${p.titulo}`,
        detalhe: `Um dos mais vendidos do período (${p.quantidade} unidades) não tem nenhum anúncio patrocinado ativo.`,
        urgencia: "media",
        linkAcao: linkAnuncio(p.itemId, conta.id),
        linkLabel: "Ver anúncio no painel",
      });
    }
  }

  // --- 4: Cruzamento Estoque / Qualidade (nivel anuncio, so campanhas ativas) ---
  for (const a of conta.anuncios) {
    if (a.status !== "active") continue;

    const qualidade = conta.qualidadePorItem.get(a.itemId);
    if (qualidade && qualidade.score !== null && qualidade.score < SCORE_QUALIDADE_CRITICO) {
      sugestoes.push({
        tipo: "pausar_qualidade_critica",
        contaId: conta.id,
        contaNome: conta.nome,
        referenciaId: a.itemId,
        titulo: `Qualidade crítica: ${a.titulo}`,
        detalhe: `Score de qualidade ${qualidade.score}/100 (Central de Qualidade) -- considere corrigir a ficha antes de continuar investindo.`,
        urgencia: "alta",
        linkAcao: "/dashboard/anuncios/qualidade",
        linkLabel: "Ver na Central de Qualidade",
      });
    }

    const sku = conta.skuPorItem.get(a.itemId);
    const ruptura = sku ? conta.rupturaPorSku.get(sku) : undefined;
    if (ruptura && ruptura.nivelRisco === "critico") {
      sugestoes.push({
        tipo: "pausar_ruptura",
        contaId: conta.id,
        contaNome: conta.nome,
        referenciaId: a.itemId,
        titulo: `Risco de ruptura: ${a.titulo}`,
        detalhe:
          ruptura.diasAteRuptura !== null
            ? `Projeção de ${ruptura.diasAteRuptura} dias até faltar estoque (SKU ${sku}) -- considere pausar ou reduzir o investimento em Ads.`
            : `SKU ${sku} classificado como risco crítico de ruptura -- considere pausar ou reduzir o investimento em Ads.`,
        urgencia: "alta",
        linkAcao: "/dashboard/estoque/metricas",
        linkLabel: "Ver em Métricas de estoque",
      });
    }
  }

  return sugestoes;
}

// Chave estavel usada tanto para persistir "Ignorar" (coluna referencia_id
// da tabela copiloto_sugestoes_ignoradas) quanto para filtrar sugestoes ja
// ignoradas na UI e no digest diario.
export function chaveSugestao(s: Sugestao): string {
  return `${s.contaId}:${s.tipo}:${s.referenciaId}`;
}

// Filtra sugestoes ja marcadas como "Ignorar". `ignoradas` e o conjunto de
// chaves (contaId:tipo:referenciaId) lido de copiloto_sugestoes_ignoradas.
export function filtrarIgnoradas(sugestoes: Sugestao[], ignoradas: Set<string>): Sugestao[] {
  return sugestoes.filter((s) => !ignoradas.has(chaveSugestao(s)));
}
