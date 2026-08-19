import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import {
  getAnunciantes,
  getCampanhas,
  getTodosAnuncios,
  getMetricasAvancadasCampanha,
  type Anunciante,
  type MetricasAvancadasCampanha,
} from "@/lib/mercadolivre/ads";
import { getProdutosMaisVendidos, periodoDeDatas } from "@/lib/mercadolivre/orders";
import { resolverSkuPorItens } from "@/lib/mercadolivre/items";
import { lerCacheQualidade, type QualidadeAnuncio } from "@/lib/mercadolivre/qualidade";
import { lerEstoquePlanilha } from "@/lib/estoque/planilha";
import { listarContainers, containersPendentesPorSku } from "@/lib/estoque/containers";
import {
  calcularVelocidadePorSku,
  projetarRupturaComContainers,
  classificarRisco,
  JANELA_VELOCIDADE_DIAS,
  type NivelRisco,
} from "@/lib/estoque/metricas";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import { gerarSugestoesConta, filtrarIgnoradas, type ContaEntrada, type Sugestao } from "@/lib/mercadolivre/copiloto";
import CopilotoPorConta, { type ContaComSugestoes } from "./copiloto-por-conta";

// force-dynamic: sugestoes cruzam dados que mudam o tempo todo (campanhas,
// qualidade, estoque) -- nunca servir um render em cache desta pagina.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

// Metricas avancadas (lost share de orcamento) so existem no endpoint de
// detalhe de campanha -- 1 chamada extra por campanha. Limitamos por conta
// para nao arriscar rate limit (mesmo teto usado em Visao geral).
const TETO_METRICAS_AVANCADAS = 6;
const TOP_N_MAIS_VENDIDOS = 10;

export default async function CopilotoPage() {
  await exigirAcessoSecao("publicidade", "publicidade_copiloto");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: contasRaw } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname, apelido, cor")
    .order("nickname", { ascending: true });
  const contas = contasRaw ?? [];

  // Periodo fixo dos ultimos 30 dias -- o Co-piloto nao tem filtro de
  // periodo proprio (diferente de Visao geral / Metricas de Desempenho),
  // olha sempre para tras o suficiente para ROAS/qualidade se estabilizarem.
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - 29 * 24 * 60 * 60 * 1000);
  const de = inicio.toISOString().slice(0, 10);
  const ate = hoje.toISOString().slice(0, 10);
  const periodo = periodoDeDatas(de, ate);

  const [qualidadeCache, itensPlanilha, containers, ignoradasRaw] = await Promise.all([
    lerCacheQualidade(supabase),
    lerEstoquePlanilha(),
    listarContainers(),
    supabase.from("copiloto_sugestoes_ignoradas").select("conta_id, tipo, referencia_id"),
  ]);

  const ignoradas = new Set(
    (ignoradasRaw.data ?? []).map((r) => `${r.conta_id}:${r.tipo}:${r.referencia_id}`)
  );

  const pendentesPorSku = containersPendentesPorSku(containers);

  // Velocidade de venda por SKU soma vendas de TODAS as contas (o saldo da
  // planilha e unico por SKU, nao por conta) -- precisa do token de cada uma.
  const contasComToken = await Promise.all(
    contas.map(async (c) => {
      try {
        const accessToken = await getValidAccessToken(c.id as string);
        return { id: c.id as string, mlUserId: String(c.ml_user_id), accessToken };
      } catch (err) {
        console.error(`Erro ao obter token da conta ${c.id}:`, err);
        return null;
      }
    })
  );
  const contasValidas = contasComToken.filter((c): c is NonNullable<typeof c> => c !== null);
  const velocidadePorSku = await calcularVelocidadePorSku(contasValidas);

  // Ruptura e um sinal GLOBAL por SKU -- calculado uma unica vez e
  // reaproveitado para todas as contas no motor de regras.
  const rupturaPorSku = new Map<string, { diasAteRuptura: number | null; nivelRisco: NivelRisco }>();
  for (const item of itensPlanilha) {
    const chave = item.sku.trim().toUpperCase();
    const quantidade60d = velocidadePorSku.get(chave) ?? 0;
    const { diasAteRuptura } = projetarRupturaComContainers(
      item.saldoTotal,
      quantidade60d / JANELA_VELOCIDADE_DIAS,
      pendentesPorSku.get(chave) ?? []
    );
    rupturaPorSku.set(chave, { diasAteRuptura, nivelRisco: classificarRisco(diasAteRuptura) });
  }

  const resultados = await Promise.all(
    contas.map(async (conta) => {
      try {
        const accessToken = await getValidAccessToken(conta.id as string);
        const anunciantes: Anunciante[] = await getAnunciantes(accessToken);

        if (anunciantes.length === 0) {
          return { conta, sugestoes: [] as Sugestao[], erro: null as string | null };
        }

        const [listasCampanhas, listasAnuncios, produtosRanking] = await Promise.all([
          Promise.all(anunciantes.map((a) => getCampanhas(accessToken, a.siteId, a.advertiserId, de, ate))),
          Promise.all(anunciantes.map((a) => getTodosAnuncios(accessToken, a.siteId, a.advertiserId, de, ate))),
          getProdutosMaisVendidos(accessToken, Number(conta.ml_user_id), periodo),
        ]);

        const campanhasPeriodo = listasCampanhas.flatMap((r, i) =>
          r.campanhas.map((c) => ({ ...c, siteId: anunciantes[i].siteId }))
        );
        const todosAnuncios = listasAnuncios.flat();

        const campanhasAtivas = campanhasPeriodo
          .filter((c) => c.status === "active")
          .slice(0, TETO_METRICAS_AVANCADAS);
        const advancedPorCampanha = new Map<number, MetricasAvancadasCampanha | null>();
        if (campanhasAtivas.length > 0) {
          const detalhes = await Promise.all(
            campanhasAtivas.map((c) => getMetricasAvancadasCampanha(accessToken, c.siteId, c.id, de, ate))
          );
          campanhasAtivas.forEach((c, i) => advancedPorCampanha.set(c.id, detalhes[i]));
        }

        const produtosTop = produtosRanking.slice(0, TOP_N_MAIS_VENDIDOS);

        // Resolve SKU dos itens que o motor de regras precisa cruzar com
        // estoque: anuncios ativos + produtos mais vendidos.
        const itemIdsParaSku = Array.from(
          new Set([...todosAnuncios.map((a) => a.itemId), ...produtosTop.map((p) => p.itemId)])
        );
        const skuPorItem =
          itemIdsParaSku.length > 0 ? await resolverSkuPorItens(accessToken, itemIdsParaSku) : new Map<string, string>();

        // Cache de qualidade e global (chaveado por itemId) -- recorta so
        // para os itens desta conta.
        const qualidadePorItem = new Map<string, QualidadeAnuncio>();
        for (const a of todosAnuncios) {
          const q = qualidadeCache.get(a.itemId);
          if (q) qualidadePorItem.set(a.itemId, q);
        }

        const contaEntrada: ContaEntrada = {
          id: conta.id as string,
          nome: nomeConta(conta),
          campanhas: campanhasPeriodo.map((c) => ({
            id: c.id,
            nome: c.nome,
            status: c.status,
            roasObjetivo: c.roasObjetivo,
            roas: c.metricas.roas,
            lostShareOrcamento: advancedPorCampanha.get(c.id)?.lostShareOrcamento ?? null,
          })),
          anuncios: todosAnuncios.map((a) => ({
            itemId: a.itemId,
            titulo: a.titulo,
            status: a.status,
            campanhaId: a.campanhaId,
          })),
          produtosMaisVendidos: produtosTop.map((p) => ({
            itemId: p.itemId,
            titulo: p.titulo,
            quantidade: p.quantidade,
          })),
          qualidadePorItem,
          skuPorItem,
          rupturaPorSku,
        };

        const sugestoes = filtrarIgnoradas(gerarSugestoesConta(contaEntrada), ignoradas);
        return { conta, sugestoes, erro: null as string | null };
      } catch (err) {
        console.error(`Erro ao gerar sugestoes da conta ${conta.id}:`, err);
        return { conta, sugestoes: [] as Sugestao[], erro: "Falha ao carregar dados desta conta." };
      }
    })
  );

  const contasFormatadas: ContaComSugestoes[] = resultados.map(({ conta, sugestoes, erro }) => ({
    id: conta.id as string,
    nome: nomeConta(conta),
    cor: (conta.cor as string) || COR_PADRAO,
    sugestoes,
    erro,
  }));

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Co-piloto</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Sugestoes automaticas cruzando campanhas, qualidade de anuncio, ranking de vendas e projecao de estoque dos
          ultimos 30 dias.
        </p>
      </div>

      <CopilotoPorConta contas={contasFormatadas} />
    </div>
  );
}
