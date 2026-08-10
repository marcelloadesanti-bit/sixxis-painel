import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import {
        getAnunciantes,
        getCampanhas,
        getTodosAnuncios,
        type Anunciante,
        type Campanha,
        type Anuncio,
} from "@/lib/mercadolivre/ads";
import { getVendas, getTotaisPorStatus, periodoDeDatas, type ProdutoRanking } from "@/lib/mercadolivre/orders";
import { buscarItensBulk, resolverSkuPorItens } from "@/lib/mercadolivre/items";
import { lerCacheQualidade } from "@/lib/mercadolivre/qualidade";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import {
        tacosDe,
        classificarTacos,
        classificarRoas,
        combinarSemaforo,
        motivoGenerico,
        sugerirMotivo,
        type Semaforo,
} from "@/lib/mercadolivre/desempenho-ads";
import { PRESETS, periodoDoPreset, formatarData, type PresetKey } from "@/lib/date-utils";
import MetricasPorConta, { type ContaAlertas } from "./metricas-por-conta";

export const maxDuration = 300;

const formatarMoeda = (valor: number, moeda: string = "BRL") =>
        new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(valor);
const formatarPct = (valor: number | null, casas = 1) => (valor !== null ? `${valor.toFixed(casas)}%` : "—");
const formatarRoas = (valor: number | null) => (valor !== null ? `${valor.toFixed(2)}x` : "—");

const TETO_DIAGNOSTICO = 20;

// O Mercado Ads so aceita consultar ate 90 dias corridos para tras -- o
// mesmo limite ja usado em Publicidade > Visao geral.
const LIMITE_DIAS_ADS = 90;

function clampPeriodoAds(de: string, ate: string, hoje: Date): { de: string; ate: string } {
        const hojeFmt = formatarData(hoje);
        const ateClamp = ate > hojeFmt ? hojeFmt : ate;
        const minDe = formatarData(new Date(hoje.getTime() - (LIMITE_DIAS_ADS - 1) * 86400000));
        const deClamp = de < minDe ? minDe : de;
        return { de: deClamp > ateClamp ? ateClamp : deClamp, ate: ateClamp };
}

// TACOS de campanha/anuncio agora usa o faturamento REAL (organico + Ads)
// dos SKUs anunciados no periodo, nao so as vendas que o Mercado Ads
// atribui ao clique do anuncio -- essas continuam disponiveis via ROAS
// (que vem direto da API, "puro" ad-attributed, sem mudanca de regra).
type LinhaAlerta = {
        nivel: "conta" | "campanha" | "anuncio";
        contaId: string;
        contaNome: string;
        contaCor: string;
        nome: string;
        investimento: number;
        vendas: number;
        tacos: number | null;
        roas: number | null;
        semaforo: Semaforo;
        motivo: string;
};

export default async function MetricasDesempenhoPage({
        searchParams,
}: {
        searchParams: Promise<{ periodo?: string; de?: string; ate?: string }>;
}) {
        await exigirAcessoSecao("publicidade", "publicidade_metricas_desempenho");
        const supabase = await createClient();

  const {
            data: { user },
  } = await supabase.auth.getUser();
        if (!user) redirect("/login");

  const params = await searchParams;
        const hoje = new Date();
        const presetSelecionado = (params.periodo as PresetKey) ?? "30dias";
        const isPersonalizado = presetSelecionado === "personalizado" && params.de && params.ate;
        const { de, ate } = isPersonalizado
          ? clampPeriodoAds(params.de!, params.ate!, hoje)
                  : periodoDoPreset(presetSelecionado, hoje);
        const minDataPersonalizada = formatarData(new Date(hoje.getTime() - (LIMITE_DIAS_ADS - 1) * 86400000));
        const maxDataPersonalizada = formatarData(hoje);
        const periodoSelecionado = periodoDeDatas(de, ate);

  const anoAtual = hoje.getFullYear();
        const mesAtual = hoje.getMonth() + 1;

  const { data: contas } = await supabase
          .from("ml_accounts")
          .select("id, ml_user_id, nickname, apelido, cor")
          .order("nickname", { ascending: true });

  const { data: metasAdsRaw } = await supabase
          .from("metas_ads")
          .select("tipo_meta, valor")
          .eq("ano", anoAtual)
          .eq("mes", mesAtual);
        const metasAdsAtual = new Map((metasAdsRaw ?? []).map((m) => [m.tipo_meta as string, Number(m.valor)]));
        const metaRoas = metasAdsAtual.get("roas_minimo") ?? null;
        const metaTacos = metasAdsAtual.get("tacos_maximo") ?? null;

  const cacheQualidade = await lerCacheQualidade(supabase);

  const resultados = await Promise.all(
            (contas ?? []).map(async (conta) => {
                        try {
                                      const accessToken = await getValidAccessToken(conta.id);
                                      const anunciantes: Anunciante[] = await getAnunciantes(accessToken);

                          if (anunciantes.length === 0) {
                                          return {
                                                            conta,
                                                            accessToken: null as string | null,
                                                            campanhas: [] as Campanha[],
                                                            anuncios: [] as Anuncio[],
                                                            porProduto: [] as ProdutoRanking[],
                                                            skuPorItemId: new Map<string, string>(),
                                                            investimentoConta: 0,
                                                            vendasAdsConta: 0,
                                                            faturamentoConta: 0,
                                                            erro: null as string | null,
                                          };
                          }

                          const [listasCampanhas, listasAnuncios, vendas, pagas, canceladas] = await Promise.all([
                                          Promise.all(anunciantes.map((a) => getCampanhas(accessToken, a.siteId, a.advertiserId, de, ate))),
                                          Promise.all(anunciantes.map((a) => getTodosAnuncios(accessToken, a.siteId, a.advertiserId, de, ate))),
                                          getVendas(accessToken, conta.ml_user_id, periodoSelecionado, conta.id as string, nomeConta(conta)),
                                          getTotaisPorStatus(accessToken, conta.ml_user_id, periodoSelecionado, "paid"),
                                          getTotaisPorStatus(accessToken, conta.ml_user_id, periodoSelecionado, "cancelled"),
                                        ]);

                          const campanhas = listasCampanhas.flatMap((r) => r.campanhas);
                                      const anuncios = listasAnuncios.flat();

                          const idsParaResolver = Array.from(
                                          new Set([...anuncios.map((a) => a.itemId), ...vendas.porProduto.map((p) => p.itemId)])
                                        );
                                      const skuPorItemId = await resolverSkuPorItens(accessToken, idsParaResolver);

                          const investimentoConta = campanhas.reduce((s, c) => s + c.metricas.cost, 0);
                                      const vendasAdsConta = campanhas.reduce((s, c) => s + c.metricas.total_amount, 0);
                                      const faturamentoConta = pagas.valor + canceladas.valor;

                          return {
                                          conta,
                                          accessToken,
                                          campanhas,
                                          anuncios,
                                          porProduto: vendas.porProduto,
                                          skuPorItemId,
                                          investimentoConta,
                                          vendasAdsConta,
                                          faturamentoConta,
                                          erro: null as string | null,
                          };
                        } catch (err) {
                                      console.error(`Erro ao buscar desempenho de Ads de ${conta.nickname}:`, err);
                                      return {
                                                      conta,
                                                      accessToken: null as string | null,
                                                      campanhas: [] as Campanha[],
                                                      anuncios: [] as Anuncio[],
                                                      porProduto: [] as ProdutoRanking[],
                                                      skuPorItemId: new Map<string, string>(),
                                                      investimentoConta: 0,
                                                      vendasAdsConta: 0,
                                                      faturamentoConta: 0,
                                                      erro: "Falha ao buscar dados desta conta.",
                                      };
                        }
            })
          );

  // Faturamento real por SKU (organico + Ads) de cada conta, no periodo
  // selecionado -- e o denominador correto do TACOS de anuncio/campanha
  // (investimento / faturamento do(s) SKU(s) anunciados, nao so as vendas
  // que o Mercado Ads atribui ao clique do anuncio).
  const revenuePorSkuPorConta = new Map<string, Map<string, number>>();
        for (const r of resultados) {
                  const porSku = new Map<string, number>();
                  for (const p of r.porProduto) {
                              const sku = r.skuPorItemId.get(p.itemId) ?? `(sem SKU) ${p.titulo}`;
                              porSku.set(sku, (porSku.get(sku) ?? 0) + p.valor);
                  }
                  revenuePorSkuPorConta.set(r.conta.id as string, porSku);
        }

  const alertasConta: LinhaAlerta[] = resultados
          .filter((r) => r.investimentoConta > 0 || r.vendasAdsConta > 0)
          .map((r) => {
                      const tacos = tacosDe(r.investimentoConta, r.faturamentoConta);
                      const roas = r.investimentoConta > 0 ? r.vendasAdsConta / r.investimentoConta : null;
                      const semTacos = classificarTacos(tacos, metaTacos);
                      const semRoas = classificarRoas(roas, metaRoas);
                      const semaforo = combinarSemaforo(semTacos, semRoas);
                      return {
                                    nivel: "conta" as const,
                                    contaId: r.conta.id as string,
                                    contaNome: nomeConta(r.conta),
                                    contaCor: (r.conta.cor as string) ?? COR_PADRAO,
                                    nome: nomeConta(r.conta),
                                    investimento: r.investimentoConta,
                                    vendas: r.faturamentoConta,
                                    tacos,
                                    roas,
                                    semaforo,
                                    motivo: motivoGenerico(semTacos, semRoas),
                      };
          });

  const alertasCampanha: LinhaAlerta[] = resultados.flatMap((r) => {
            const porSku = revenuePorSkuPorConta.get(r.conta.id as string) ?? new Map<string, number>();
            const skusPorCampanha = new Map<number, Set<string>>();
            for (const a of r.anuncios) {
                        const sku = r.skuPorItemId.get(a.itemId) ?? `(sem SKU) ${a.titulo}`;
                        const set = skusPorCampanha.get(a.campanhaId) ?? new Set<string>();
                        set.add(sku);
                        skusPorCampanha.set(a.campanhaId, set);
            }

                                                                return r.campanhas
              .filter((c) => c.metricas.cost > 0)
              .map((c) => {
                            const skus = skusPorCampanha.get(c.id) ?? new Set<string>();
                            const vendasSku = Array.from(skus).reduce((s, sku) => s + (porSku.get(sku) ?? 0), 0);
                            const tacos = tacosDe(c.metricas.cost, vendasSku);
                            const roas = c.metricas.roas;
                            const semTacos = classificarTacos(tacos, metaTacos);
                            const semRoas = classificarRoas(roas, metaRoas);
                            const semaforo = combinarSemaforo(semTacos, semRoas);
                            return {
                                            nivel: "campanha" as const,
                                            contaId: r.conta.id as string,
                                            contaNome: nomeConta(r.conta),
                                            contaCor: (r.conta.cor as string) ?? COR_PADRAO,
                                            nome: c.nome,
                                            investimento: c.metricas.cost,
                                            vendas: vendasSku,
                                            tacos,
                                            roas,
                                            semaforo,
                                            motivo: motivoGenerico(semTacos, semRoas),
                            };
              });
  });

  const anunciosComConta = resultados.flatMap((r) => {
            const porSku = revenuePorSkuPorConta.get(r.conta.id as string) ?? new Map<string, number>();
            return r.anuncios
              .filter((a) => a.cost > 0)
              .map((a) => {
                            const sku = r.skuPorItemId.get(a.itemId) ?? `(sem SKU) ${a.titulo}`;
                            const vendasSku = porSku.get(sku) ?? 0;
                            return {
                                            ...a,
                                            contaId: r.conta.id as string,
                                            contaNome: nomeConta(r.conta),
                                            contaCor: (r.conta.cor as string) ?? COR_PADRAO,
                                            accessToken: r.accessToken,
                                            vendasSku,
                            };
              });
  });

  const anunciosClassificados = anunciosComConta.map((a) => {
            const tacos = tacosDe(a.cost, a.vendasSku);
            const semTacos = classificarTacos(tacos, metaTacos);
            const semRoas = classificarRoas(a.roas, metaRoas);
            const semaforo = combinarSemaforo(semTacos, semRoas);
            return { ...a, tacos, semaforo };
  });

  const criticosPorConta = new Map<string, typeof anunciosClassificados>();
        for (const a of anunciosClassificados) {
                  if (a.semaforo !== "critico") continue;
                  const lista = criticosPorConta.get(a.contaId) ?? [];
                  lista.push(a);
                  criticosPorConta.set(a.contaId, lista);
        }

  const saudePorItem = new Map<string, number | null>();
        await Promise.all(
                  Array.from(criticosPorConta.entries()).map(async ([, lista]) => {
                              const accessToken = lista[0]?.accessToken;
                              if (!accessToken) return;
                              const ids = lista.slice(0, TETO_DIAGNOSTICO).map((a) => a.itemId);
                              const itens = await buscarItensBulk(accessToken, ids);
                              for (const item of itens) {
                                            saudePorItem.set(item.id, typeof item.health === "number" ? item.health : null);
                              }
                  })
                );

  const alertasAnuncio: LinhaAlerta[] = anunciosClassificados.map((a) => {
            const motivo =
                        a.semaforo === "critico"
                ? sugerirMotivo("critico", {
                                  ctr: a.ctr,
                                  saude: saudePorItem.get(a.itemId) ?? null,
                                  qualidade: cacheQualidade.get(a.itemId) ?? null,
                })
                          : motivoGenerico(classificarTacos(a.tacos, metaTacos), classificarRoas(a.roas, metaRoas));
            return {
                        nivel: "anuncio" as const,
                        contaId: a.contaId,
                        contaNome: a.contaNome,
                        contaCor: a.contaCor,
                        nome: a.titulo,
                        investimento: a.cost,
                        vendas: a.vendasSku,
                        tacos: a.tacos,
                        roas: a.roas,
                        semaforo: a.semaforo,
                        motivo,
            };
  });

  const contasMap = new Map<string, ContaAlertas>();
        for (const r of resultados) {
                  contasMap.set(r.conta.id as string, {
                              id: r.conta.id as string,
                              nome: nomeConta(r.conta),
                              cor: (r.conta.cor as string) ?? COR_PADRAO,
                              criticos: 0,
                              padroes: 0,
                              itens: [],
                  });
        }

  const todosOsAlertas: LinhaAlerta[] = [...alertasConta, ...alertasCampanha, ...alertasAnuncio];

  const totalCriticos = todosOsAlertas.filter((a) => a.semaforo === "critico").length;
        const totalPadrao = todosOsAlertas.filter((a) => a.semaforo === "padrao").length;
        const totalOtimos = todosOsAlertas.filter((a) => a.semaforo === "otimo").length;

  const contaIdsComAtividade = new Set(todosOsAlertas.map((a) => a.contaId));

  for (const a of todosOsAlertas) {
            const entry = contasMap.get(a.contaId);
            if (!entry) continue;
            if (a.semaforo === "critico") entry.criticos += 1;
            if (a.semaforo === "padrao") entry.padroes += 1;
            if (a.semaforo !== "otimo") {
                        entry.itens.push({
                                      nivel: a.nivel,
                                      nome: a.nome,
                                      investimentoLabel: formatarMoeda(a.investimento),
                                      vendasLabel: formatarMoeda(a.vendas),
                                      tacosLabel: formatarPct(a.tacos),
                                      roasLabel: formatarRoas(a.roas),
                                      semaforo: a.semaforo,
                                      motivo: a.motivo,
                        });
            }
  }

  const contasFormatadas: ContaAlertas[] = Array.from(contasMap.values())
          .filter((c) => contaIdsComAtividade.has(c.id))
          .sort((a, b) => b.criticos - a.criticos || b.padroes - a.padroes || a.nome.localeCompare(b.nome));

  return (
            <div className="flex flex-col gap-6 p-6">
              <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Métricas de Desempenho</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Alertas de TACOS e ROAS por conta, campanha e anúncio no período selecionado. TACOS de campanha/anúncio usa o faturamento real (orgânico + Ads) dos SKUs anunciados, não só as vendas atribuídas pelo clique do anúncio. Diagnóstico de qualidade limitado aos {TETO_DIAGNOSTICO} anúncios mais críticos por conta.
                              </p>
            </div>

      <div className="flex flex-wrap items-end gap-4">
              <div className="flex flex-wrap gap-2">
      {PRESETS.map((p) => (
                        <Link
                          key={p.key}
                          href={`/dashboard/publicidade/metricas?periodo=${p.key}`}
                          className={`rounded-full border px-3 py-1 text-xs ${
                                                presetSelecionado === p.key
                                                  ? "border-[var(--color-sixxis-navy)] bg-[var(--color-sixxis-navy)] text-white"
                                                  : "border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                          }`}
            >
{p.label}
            </Link>
          ))}
        </div>

        <form className="flex items-end gap-2">
          <input type="hidden" name="periodo" value="personalizado" />
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">De</label>
            <input
              type="date"
              name="de"
              defaultValue={de}
              min={minDataPersonalizada}
              max={maxDataPersonalizada}
              className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Até</label>
            <input
              type="date"
              name="ate"
              defaultValue={ate}
              min={minDataPersonalizada}
              max={maxDataPersonalizada}
              className="rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </div>
          <button
            type="submit"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Período personalizado
          </button>
        </form>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Período: {new Date(de + "T00:00:00").toLocaleDateString("pt-BR")} até{" "}
{new Date(ate + "T00:00:00").toLocaleDateString("pt-BR")} · o Mercado Ads permite consultar até{" "}
{LIMITE_DIAS_ADS} dias anteriores a hoje
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/30">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">Críticos</p>
          <p className="mt-1 text-3xl font-bold text-red-700 dark:text-red-400">{totalCriticos}</p>
        </div>
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950/30">
          <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">Padrão</p>
          <p className="mt-1 text-3xl font-bold text-yellow-700 dark:text-yellow-400">{totalPadrao}</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950/30">
          <p className="text-sm font-medium text-green-700 dark:text-green-400">Ótimos</p>
          <p className="mt-1 text-3xl font-bold text-green-700 dark:text-green-400">{totalOtimos}</p>
        </div>
      </div>

{contasFormatadas.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400 dark:border-gray-700 dark:bg-gray-800">
                Nenhum dado de Ads disponível no período.
                              </div>
       ) : (
                     <MetricasPorConta contas={contasFormatadas} />
       )}
    </div>
  );
}
