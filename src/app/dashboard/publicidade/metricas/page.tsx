import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import {
    getAnunciantes,
    getCampanhas,
    getAnuncios,
    getAnunciosPorInvestimento,
    type Anunciante,
    type Campanha,
    type Anuncio,
} from "@/lib/mercadolivre/ads";
import { getTotaisPorStatus, periodoDeDatas } from "@/lib/mercadolivre/orders";
import { buscarItensBulk } from "@/lib/mercadolivre/items";
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

const LINK_ADS = "https://ads.mercadolivre.com.br/productAds";

const formatarMoeda = (valor: number, moeda: string = "BRL") =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(valor);
const formatarPct = (valor: number | null, casas = 1) => (valor !== null ? `${valor.toFixed(casas)}%` : "—");
const formatarRoas = (valor: number | null) => (valor !== null ? `${valor.toFixed(2)}x` : "—");

const TETO_DIAGNOSTICO = 20;

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

function CorSemaforo({ semaforo }: { semaforo: Semaforo }) {
    const estilos: Record<Semaforo, string> = {
          otimo: "bg-green-100 text-green-700",
          padrao: "bg-yellow-100 text-yellow-700",
          critico: "bg-red-100 text-red-700",
    };
    const rotulos: Record<Semaforo, string> = { otimo: "Ótimo", padrao: "Padrão", critico: "Crítico" };
    return (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estilos[semaforo]}`}>{rotulos[semaforo]}</span>
        );
}

export default async function MetricasDesempenhoPage() {
    await exigirAcessoSecao("publicidade", "publicidade_metricas_desempenho");
    const supabase = await createClient();

  const {
        data: { user },
  } = await supabase.auth.getUser();
    if (!user) redirect("/login");

  const hoje = new Date();
    const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1;
    const primeiroDiaMes = `${anoAtual}-${String(mesAtual).padStart(2, "0")}-01`;
    const hojeStr = hoje.toISOString().slice(0, 10);
    const periodoMes = periodoDeDatas(primeiroDiaMes, hojeStr);

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
                                            investimentoConta: 0,
                                            vendasAdsConta: 0,
                                            faturamentoConta: 0,
                                            erro: null as string | null,
                              };
                  }

                  const [listasCampanhas, listasVendas, listasInvestimento, pagas, canceladas] = await Promise.all([
                              Promise.all(anunciantes.map((a) => getCampanhas(accessToken, a.siteId, a.advertiserId, primeiroDiaMes, hojeStr))),
                              Promise.all(anunciantes.map((a) => getAnuncios(accessToken, a.siteId, a.advertiserId, primeiroDiaMes, hojeStr, 15))),
                              Promise.all(
                                            anunciantes.map((a) => getAnunciosPorInvestimento(accessToken, a.siteId, a.advertiserId, primeiroDiaMes, hojeStr, 15))
                                          ),
                              getTotaisPorStatus(accessToken, conta.ml_user_id, periodoMes, "paid"),
                              getTotaisPorStatus(accessToken, conta.ml_user_id, periodoMes, "cancelled"),
                            ]);

                  const campanhas = listasCampanhas.flatMap((r) => r.campanhas);

                  const mapaAnuncios = new Map<string, Anuncio>();
                          for (const lista of [...listasVendas, ...listasInvestimento]) {
                                      for (const a of lista) mapaAnuncios.set(a.itemId, a);
                          }
                          const anuncios = Array.from(mapaAnuncios.values());

                  const investimentoConta = campanhas.reduce((s, c) => s + c.metricas.cost, 0);
                          const vendasAdsConta = campanhas.reduce((s, c) => s + c.metricas.total_amount, 0);
                          const faturamentoConta = pagas.valor + canceladas.valor;

                  return {
                              conta,
                              accessToken,
                              campanhas,
                              anuncios,
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
                                      investimentoConta: 0,
                                      vendasAdsConta: 0,
                                      faturamentoConta: 0,
                                      erro: "Falha ao buscar dados desta conta.",
                          };
                }
        })
      );

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

  const alertasCampanha: LinhaAlerta[] = resultados.flatMap((r) =>
        r.campanhas
                                                                  .filter((c) => c.metricas.cost > 0)
                                                                  .map((c) => {
                                                                            const tacos = tacosDe(c.metricas.cost, c.metricas.total_amount);
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
                                                                                        vendas: c.metricas.total_amount,
                                                                                        tacos,
                                                                                        roas,
                                                                                        semaforo,
                                                                                        motivo: motivoGenerico(semTacos, semRoas),
                                                                            };
                                                                  })
                                                              );

  const anunciosComConta = resultados.flatMap((r) =>
        r.anuncios
                                                    .filter((a) => a.cost > 0)
                                                    .map((a) => ({
                                                              ...a,
                                                              contaId: r.conta.id as string,
                                                              contaNome: nomeConta(r.conta),
                                                              contaCor: (r.conta.cor as string) ?? COR_PADRAO,
                                                              accessToken: r.accessToken,
                                                    }))
                                                );

  const anunciosClassificados = anunciosComConta.map((a) => {
        const tacos = tacosDe(a.cost, a.totalAmount);
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
                vendas: a.totalAmount,
                tacos: a.tacos,
                roas: a.roas,
                semaforo: a.semaforo,
                motivo,
        };
  });

  const RANQUE: Record<Semaforo, number> = { critico: 0, padrao: 1, otimo: 2 };
    const todosAlertas = [...alertasConta, ...alertasCampanha, ...alertasAnuncio]
      .filter((a) => a.semaforo !== "otimo")
      .sort((a, b) => RANQUE[a.semaforo] - RANQUE[b.semaforo]);

  const totalCriticos = todosAlertas.filter((a) => a.semaforo === "critico").length;
    const totalPadrao = todosAlertas.filter((a) => a.semaforo === "padrao").length;

  const rotuloNivel: Record<LinhaAlerta["nivel"], string> = {
        conta: "Conta",
        campanha: "Campanha",
        anuncio: "Anúncio",
  };

  return (
        <div className="mx-auto max-w-6xl p-6">
          <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Métricas de Desempenho</h1>
        <p className="mb-6 text-sm text-gray-500">
          Publicidade — alertas de TACOS/ROAS fora da meta (mês corrente), por conta, campanha e anúncio. Modo leitura.
                  </p>

  {metaTacos === null || metaRoas === null ? (
            <div className="mb-6 rounded border border-dashed border-gray-300 p-4 text-sm text-gray-500">
              Metas de Ads (TACOS máximo / ROAS mínimo) não configuradas para este mês ·{" "}
             <a href="/dashboard/configuracoes/metas?aba=ads" className="text-[var(--color-sixxis-blue)] underline">
               definir metas
             </a>
           </div>
         ) : (
                   <p className="mb-6 text-xs text-gray-400">
             Meta atual: TACOS máximo {formatarPct(metaTacos)} · ROAS mínimo {formatarRoas(metaRoas)} · tolerância de
             10% antes de virar crítico
           </p>
         )}

      <div className="mb-6 flex gap-4">
          <div className="rounded border border-t-4 border-t-red-500 border-gray-200 bg-white p-4">
            <p className="text-xs uppercase text-gray-400">Críticos</p>
            <p className="text-xl font-bold text-gray-900">{totalCriticos}</p>
          </div>
          <div className="rounded border border-t-4 border-t-yellow-500 border-gray-200 bg-white p-4">
            <p className="text-xs uppercase text-gray-400">Padrão (perto da meta)</p>
            <p className="text-xl font-bold text-gray-900">{totalPadrao}</p>
          </div>
        </div>

  {todosAlertas.length === 0 ? (
            <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
              Nenhum alerta — tudo dentro da meta no mês corrente.
                        </div>
         ) : (
                   <div className="overflow-x-auto rounded border border-gray-200 bg-white">
             <table className="w-full text-sm">
               <thead>
                 <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                   <th className="p-3">Conta</th>
                   <th className="p-3">Nível</th>
                   <th className="p-3">Nome</th>
                   <th className="p-3 text-right">Investimento</th>
                   <th className="p-3 text-right">Vendas</th>
                   <th className="p-3 text-right">TACOS</th>
                   <th className="p-3 text-right">ROAS</th>
                   <th className="p-3">Semáforo</th>
                   <th className="p-3">Motivo sugerido</th>
                   <th className="p-3"></th>
                 </tr>
               </thead>
               <tbody>
   {todosAlertas.map((a, i) => (
                     <tr key={`${a.nivel}-${a.contaId}-${a.nome}-${i}`} className="border-b border-gray-100 last:border-0 align-top">
                     <td className="p-3">
                       <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: a.contaCor }} />
  {a.contaNome}
                    </td>
                    <td className="p-3 text-xs text-gray-500">{rotuloNivel[a.nivel]}</td>
                    <td className="p-3 max-w-xs truncate" title={a.nome}>
{a.nome}
                    </td>
                    <td className="p-3 text-right">{formatarMoeda(a.investimento)}</td>
                    <td className="p-3 text-right">{formatarMoeda(a.vendas)}</td>
                    <td className="p-3 text-right">{formatarPct(a.tacos)}</td>
                    <td className="p-3 text-right">{formatarRoas(a.roas)}</td>
                    <td className="p-3">
                      <CorSemaforo semaforo={a.semaforo} />
                  </td>
                  <td className="p-3 max-w-sm text-xs text-gray-600">{a.motivo}</td>
                  <td className="p-3">
                    <a
                      href={LINK_ADS}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="whitespace-nowrap rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Ir para campanha
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
