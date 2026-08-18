import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import {
    getAnunciantes,
    getCampanhas,
    getAnuncios,
    getMetricasAvancadasCampanha,
    type Campanha,
    type Anunciante,
    type Anuncio,
    type MetricasAvancadasCampanha,
} from "@/lib/mercadolivre/ads";
import { getTotaisPorStatus, periodoDeDatas } from "@/lib/mercadolivre/orders";
import { PRESETS, type PresetKey, periodoDoPreset, formatarData } from "@/lib/date-utils";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import PublicidadePorConta, {
    type ContaComCampanhas,
    type CampanhaFormatada,
    type AnuncioFormatado,
} from "./publicidade-por-conta";

const formatarMoeda = (valor: number, moeda: string = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(valor);

const formatarPct = (valor: number | null, casas = 1) => (valor !== null ? `${valor.toFixed(casas)}%` : "—");
const formatarRoas = (valor: number | null) => (valor !== null ? `${valor.toFixed(2)}x` : "—");
// impression_share e lost_impression_share_* podem vir como fracao (0-1) ou
// ja em pontos percentuais, dependendo do endpoint -- normalizamos aqui.
const formatarPctFracao = (valor: number, casas = 1) => `${(valor <= 1 ? valor * 100 : valor).toFixed(casas)}%`;

// Ordem fixa (nao alfabetica) pedida especificamente para a tela de Ads --
// as demais telas (Pos-venda, Promocoes) continuam ordenadas por nickname.
const ORDEM_CONTAS_ADS = ["SIXXISARBRASIL", "SIXXIS", "SIXXISBR", "SIXXISBRASIL", "BRASILSIXXIS"];
const posicaoConta = (nickname: string) => {
  const i = ORDEM_CONTAS_ADS.indexOf(nickname);
    return i === -1 ? 999 : i;
};

// Metricas avancadas de campanha (impression share etc.) so existem no
// endpoint de detalhe -- 1 chamada extra por campanha. Limitamos por conta
// para nao arriscar rate limit somando com as demais chamadas da pagina.
const TETO_METRICAS_AVANCADAS = 6;

// O Mercado Ads (Product Ads) so aceita consultas de ate 90 dias anteriores
// a hoje -- usado tanto para limitar o periodo personalizado (evita erro 400
// da API) quanto para os atributos min/max dos campos de data na tela.
const LIMITE_DIAS_ADS = 90;

function clampPeriodoAds(de: string, ate: string, hoje: Date): { de: string; ate: string } {
    const hojeFmt = formatarData(hoje);
    const ateClamp = ate > hojeFmt ? hojeFmt : ate;
    const minDe = formatarData(new Date(hoje.getTime() - (LIMITE_DIAS_ADS - 1) * 86400000));
    const deClamp = de < minDe ? minDe : de;
    return { de: deClamp > ateClamp ? ateClamp : deClamp, ate: ateClamp };
}

// --- "Metas em andamento": indicadores calculados a partir dos dados reais
// do mes corrente (nao respeita o filtro de periodo da pagina, igual a meta
// de faturamento no Resumo -- e sempre "mes atual, todas as contas"). ---
type CardMeta = {
    titulo: string;
    valorLabel: string;
    metaLabel: string | null;
    pct: number | null;
    dentroDaMeta: boolean | null;
};

function CardMetaAndamento({ card }: { card: CardMeta }) {
    const corBarra = card.dentroDaMeta === null ? "bg-gray-300" : card.dentroDaMeta ? "bg-green-500" : "bg-red-500";
    const corTexto = card.dentroDaMeta === null ? "text-gray-400" : card.dentroDaMeta ? "text-green-600" : "text-red-500";
    return (
          <div className="rounded border border-gray-200 bg-white p-4">
            <p className="text-xs uppercase text-gray-400">{card.titulo}</p>
        <p className="text-xl font-bold text-gray-900">{card.valorLabel}</p>
  {card.metaLabel ? (
            <>
              <p className={`text-xs font-medium ${corTexto}`}>
              Meta: {card.metaLabel}
  {card.dentroDaMeta !== null && (card.dentroDaMeta ? " · dentro da meta" : " · fora da meta")}
            </p>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className={`h-full rounded-full transition-all ${corBarra}`}
              style={{ width: `${card.pct !== null ? Math.min(100, Math.max(0, card.pct)) : 0}%` }}
            />
          </div>
        </>
      ) : (
                <p className="text-xs text-gray-400">
          Meta não definida ·{" "}
          <a href="/dashboard/configuracoes/metas?aba=ads" className="text-[var(--color-sixxis-blue)] underline">
            definir
          </a>
        </p>
      )}
    </div>
  );
}

export default async function PublicidadePage({
    searchParams,
}: {
    searchParams: Promise<{ periodo?: string; de?: string; ate?: string }>;
}) {
    await exigirAcessoSecao("publicidade", "publicidade_visao_geral");
    const params = await searchParams;
    const supabase = await createClient();

  const {
        data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
        redirect("/login");
  }

  const hoje = new Date();
    const presetSelecionado = (params.periodo as PresetKey) ?? "30dias";
    const isPersonalizado = presetSelecionado === "personalizado" && params.de && params.ate;
    const { de, ate } = isPersonalizado
      ? clampPeriodoAds(params.de!, params.ate!, hoje)
          : periodoDoPreset(presetSelecionado, hoje);
    const minDataPersonalizada = formatarData(new Date(hoje.getTime() - (LIMITE_DIAS_ADS - 1) * 86400000));
    const maxDataPersonalizada = formatarData(hoje);

  const { data: contas } = await supabase
      .from("ml_accounts")
      .select("id, ml_user_id, nickname, apelido, cor")
      .order("nickname", { ascending: true });

  const anoAtual = hoje.getFullYear();
    const mesAtual = hoje.getMonth() + 1;
    const primeiroDiaMes = `${anoAtual}-${String(mesAtual).padStart(2, "0")}-01`;
    const hojeStr = hoje.toISOString().slice(0, 10);
    const periodoMes = periodoDeDatas(primeiroDiaMes, hojeStr);

  const { data: metasAdsRaw } = await supabase
      .from("metas_ads")
      .select("tipo_meta, valor")
      .eq("ano", anoAtual)
      .eq("mes", mesAtual);
    const metasAdsAtual = new Map((metasAdsRaw ?? []).map((m) => [m.tipo_meta as string, Number(m.valor)]));

  // Busca anunciantes uma unica vez por conta e reaproveita para as janelas
  // de tempo (mes corrente, para "Metas em andamento", e periodo filtrado na
  // tela, para os cards consolidados + campanhas/anuncios por conta).
  const resultados = await Promise.all(
        (contas ?? []).map(async (conta) => {
          try {
                  const accessToken = await getValidAccessToken(conta.id);
                  const anunciantes: Anunciante[] = await getAnunciantes(accessToken);

        if (anunciantes.length === 0) {
                    return {
                                  conta,
                                  semAnuncios: true,
                                  campanhasPeriodo: [] as Campanha[],
                                  anuncios: [] as Anuncio[],
                                  advancedPorCampanha: new Map<number, MetricasAvancadasCampanha | null>(),
                                  investimentoMes: 0,
                                  vendasAdsMes: 0,
                                  faturamentoMes: 0,
                                  erro: null as string | null,
                      };
}

        const [listasPeriodo, listasMes, pagasMes, canceladasMes, listasAnuncios] = await Promise.all([
                    Promise.all(anunciantes.map((a) => getCampanhas(accessToken, a.siteId, a.advertiserId, de, ate))),
                    Promise.all(
                                  anunciantes.map((a) => getCampanhas(accessToken, a.siteId, a.advertiserId, primeiroDiaMes, hojeStr))
                                ),
                    getTotaisPorStatus(accessToken, conta.ml_user_id, periodoMes, "paid"),
                    getTotaisPorStatus(accessToken, conta.ml_user_id, periodoMes, "cancelled"),
                    Promise.all(anunciantes.map((a) => getAnuncios(accessToken, a.siteId, a.advertiserId, de, ate, 10))),
                  ]);

        // Tag de siteId por campanha (necessario para a chamada de detalhe
        // das metricas avancadas, que exige o site do anunciante dono dela).
        const campanhasPeriodo = listasPeriodo.flatMap((r, i) =>
          r.campanhas.map((c) => ({ ...c, siteId: anunciantes[i].siteId }))
        );
        const campanhasMes = listasMes.flatMap((r) => r.campanhas);
        const anuncios = listasAnuncios
          .flat()
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, 10);

        // Metricas avancadas so para campanhas ativas, ate o teto -- 1
        // chamada por campanha, em paralelo mas com numero limitado.
        const campanhasAtivas = campanhasPeriodo.filter((c) => c.status === "active").slice(0, TETO_METRICAS_AVANCADAS);
        const advancedPorCampanha = new Map<number, MetricasAvancadasCampanha | null>();
        if (campanhasAtivas.length > 0) {
          const detalhes = await Promise.all(
                        campanhasAtivas.map((c) => getMetricasAvancadasCampanha(accessToken, c.siteId, c.id, de, ate))
                      );
                    campanhasAtivas.forEach((c, i) => advancedPorCampanha.set(c.id, detalhes[i]));
        }

        const investimentoMes = campanhasMes.reduce((s, c) => s + c.metricas.cost, 0);
        const vendasAdsMes = campanhasMes.reduce((s, c) => s + c.metricas.total_amount, 0);
        const faturamentoMes = pagasMes.valor + canceladasMes.valor;

        return {
                    conta,
                    semAnuncios: false,
                    campanhasPeriodo,
                    anuncios,
                    advancedPorCampanha,
                    investimentoMes,
                    vendasAdsMes,
                    faturamentoMes,
                    erro: null as string | null,
        };
} catch (err) {
          console.error(`Erro ao buscar publicidade de ${conta.nickname}:`, err);
          return {
                      conta,
                      semAnuncios: false,
                      campanhasPeriodo: [] as Campanha[],
                      anuncios: [] as Anuncio[],
                      advancedPorCampanha: new Map<number, MetricasAvancadasCampanha | null>(),
                      investimentoMes: 0,
                      vendasAdsMes: 0,
                      faturamentoMes: 0,
                      erro: "Falha ao buscar dados de Mercado Ads desta conta.",
            };
}
})
  );

  // --- Cards consolidados do cabecalho (periodo filtrado na tela) ---
  const todasCampanhas = resultados.flatMap((r) =>
    r.campanhasPeriodo.map((c) => ({
      ...c,
      contaNickname: nomeConta(r.conta),
      contaCor: r.conta.cor ?? COR_PADRAO,
    }))
  );
  const investimentoTotal = todasCampanhas.reduce((s, c) => s + c.metricas.cost, 0);
  const cliquesTotal = todasCampanhas.reduce((s, c) => s + c.metricas.clicks, 0);
  const impressoesTotal = todasCampanhas.reduce((s, c) => s + c.metricas.prints, 0);
  const vendasTotal = todasCampanhas.reduce((s, c) => s + c.metricas.total_amount, 0);
  const moeda = todasCampanhas[0]?.moeda ?? "BRL";
  const acosMedio = vendasTotal > 0 ? (investimentoTotal / vendasTotal) * 100 : 0;
  const unitsTotal = todasCampanhas.reduce((s, c) => s + c.metricas.units_quantity, 0);
  const roasGeral = investimentoTotal > 0 ? vendasTotal / investimentoTotal : 0;

  // --- "Metas em andamento" (mes corrente, todas as contas, real) ---
  const investimentoAdsMesTotal = resultados.reduce((s, r) => s + r.investimentoMes, 0);
  const vendasAdsMesTotal = resultados.reduce((s, r) => s + r.vendasAdsMes, 0);
  const faturamentoMesTotal = resultados.reduce((s, r) => s + r.faturamentoMes, 0);

  const roasAtual = investimentoAdsMesTotal > 0 ? vendasAdsMesTotal / investimentoAdsMesTotal : null;
  const tacosAtual = faturamentoMesTotal > 0 ? (investimentoAdsMesTotal / faturamentoMesTotal) * 100 : null;
  const proporcaoOrganicoAtual =
        faturamentoMesTotal > 0 ? ((faturamentoMesTotal - vendasAdsMesTotal) / faturamentoMesTotal) * 100 : null;

  const metaProporcao = metasAdsAtual.get("proporcao_organico_min") ?? null;
  const metaRoas = metasAdsAtual.get("roas_minimo") ?? null;
  const metaTacos = metasAdsAtual.get("tacos_maximo") ?? null;
  const orcamentoMensal = metasAdsAtual.get("orcamento_mensal") ?? null;

  const cardsMeta: CardMeta[] = [
    {
            titulo: "Proporção orgânico (mês)",
            valorLabel: formatarPct(proporcaoOrganicoAtual),
            metaLabel: metaProporcao !== null ? `mín. ${formatarPct(metaProporcao)}` : null,
            pct: metaProporcao && proporcaoOrganicoAtual !== null ? (proporcaoOrganicoAtual / metaProporcao) * 100 : null,
            dentroDaMeta:
                      metaProporcao !== null && proporcaoOrganicoAtual !== null ? proporcaoOrganicoAtual >= metaProporcao : null,
    },
    {
            titulo: "ROAS (mês)",
            valorLabel: formatarRoas(roasAtual),
            metaLabel: metaRoas !== null ? `mín. ${formatarRoas(metaRoas)}` : null,
            pct: metaRoas && roasAtual !== null ? (roasAtual / metaRoas) * 100 : null,
            dentroDaMeta: metaRoas !== null && roasAtual !== null ? roasAtual >= metaRoas : null,
    },
    {
            titulo: "TACOS (mês)",
            valorLabel: formatarPct(tacosAtual),
            metaLabel: metaTacos !== null ? `máx. ${formatarPct(metaTacos)}` : null,
            pct: metaTacos && tacosAtual !== null ? (tacosAtual / metaTacos) * 100 : null,
            dentroDaMeta: metaTacos !== null && tacosAtual !== null ? tacosAtual <= metaTacos : null,
    },
      ];

  const pctOrcamento = orcamentoMensal && orcamentoMensal > 0 ? (investimentoAdsMesTotal / orcamentoMensal) * 100 : null;

  // --- Participacao e ranking por conta (periodo filtrado na tela) --
  // pedido explicito do usuario: quanto cada conta representa do
  // investimento e do faturamento vindo de ads, ordenado da maior para a
  // menor eficiencia (ROAS = vendas por ads / investimento).
  const rankingContas = resultados
    .map((r) => {
      const investimento = r.campanhasPeriodo.reduce((s, c) => s + c.metricas.cost, 0);
          const vendas = r.campanhasPeriodo.reduce((s, c) => s + c.metricas.total_amount, 0);
          const acos = vendas > 0 ? (investimento / vendas) * 100 : null;
          const roas = investimento > 0 ? vendas / investimento : null;
          return {
                    id: r.conta.id as string,
                    nome: nomeConta(r.conta),
                    cor: (r.conta.cor as string) ?? COR_PADRAO,
                    investimento,
                    vendas,
                    acos,
                    roas,
                    pctInvestimento: investimentoTotal > 0 ? (investimento / investimentoTotal) * 100 : 0,
                    pctVendas: vendasTotal > 0 ? (vendas / vendasTotal) * 100 : 0,
            };
  })
    .filter((c) => c.investimento > 0 || c.vendas > 0)
    .sort((a, b) => (b.roas ?? -1) - (a.roas ?? -1));

  // --- Campanhas + anuncios reais por conta, ordem fixa (so nesta tela) ---
  const contasComCampanhas: ContaComCampanhas[] = resultados
    .slice()
    .sort((a, b) => posicaoConta(a.conta.nickname as string) - posicaoConta(b.conta.nickname as string))
    .map((r) => {
      const investimentoConta = r.campanhasPeriodo.reduce((s, c) => s + c.metricas.cost, 0);
            const cliquesConta = r.campanhasPeriodo.reduce((s, c) => s + c.metricas.clicks, 0);
            const impressoesConta = r.campanhasPeriodo.reduce((s, c) => s + c.metricas.prints, 0);
            const vendasConta = r.campanhasPeriodo.reduce((s, c) => s + c.metricas.total_amount, 0);
            const acosConta = vendasConta > 0 ? (investimentoConta / vendasConta) * 100 : 0;
            const moedaConta = r.campanhasPeriodo[0]?.moeda ?? "BRL";

      const campanhas: CampanhaFormatada[] = r.campanhasPeriodo.map((c) => {
                const adv = r.advancedPorCampanha.get(c.id) ?? null;
                return {
                            id: c.id,
                            nome: c.nome,
                            status: c.status,
                            investimentoLabel: formatarMoeda(c.metricas.cost, c.moeda),
                            cliques: c.metricas.clicks,
                            ctrLabel: `${(c.metricas.ctr * 100).toFixed(2)}%`,
                            acosLabel: `${c.metricas.acos.toFixed(1)}%`,
                            roasLabel: formatarRoas(c.metricas.roas),
                            vendasLabel: formatarMoeda(c.metricas.total_amount, c.moeda),
                            roasObjetivoLabel: c.roasObjetivo !== null ? formatarRoas(c.roasObjetivo) : null,
                            impressionShareLabel: adv?.impressionShare != null ? formatarPctFracao(adv.impressionShare) : null,
                            lostShareOrcamentoLabel: adv?.lostShareOrcamento != null ? formatarPctFracao(adv.lostShareOrcamento) : null,
                            lostShareRankingLabel: adv?.lostShareRanking != null ? formatarPctFracao(adv.lostShareRanking) : null,
                };
      });

      const anuncios: AnuncioFormatado[] = r.anuncios.map((a) => ({
                itemId: a.itemId,
                titulo: a.titulo,
                status: a.status,
                cliques: a.clicks,
                investimentoLabel: formatarMoeda(a.cost),
                roasLabel: a.roas !== null ? formatarRoas(a.roas) : "—",
                vendasLabel: formatarMoeda(a.totalAmount),
      }));

      return {
                id: r.conta.id as string,
                nome: nomeConta(r.conta),
                cor: (r.conta.cor as string) ?? COR_PADRAO,
                erro: r.erro,
                semAnuncios: r.semAnuncios,
                resumo: {
                            investimentoLabel: formatarMoeda(investimentoConta, moedaConta),
                            cliquesLabel: cliquesConta.toLocaleString("pt-BR"),
                            impressoesLabel: impressoesConta.toLocaleString("pt-BR"),
                            vendasLabel: formatarMoeda(vendasConta, moedaConta),
                            acosLabel: `${acosConta.toFixed(1)}%`,
                },
                campanhas,
                anuncios,
      };
    });

  return (
        <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Publicidade</h1>
      <p className="mb-6 text-sm text-gray-500">
        Mercado Ads — campanhas consolidadas de todas as {contas?.length ?? 0} contas
      </p>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="flex flex-wrap gap-2">
{PRESETS.map((p) => (
              <Link
                key={p.key}
              href={`/dashboard/publicidade?periodo=${p.key}`}
              className={`rounded-full border px-3 py-1 text-xs ${
                                presetSelecionado === p.key
                                  ? "border-[var(--color-sixxis-navy)] bg-[var(--color-sixxis-navy)] text-white"
                                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
{p.label}
            </Link>
          ))}
        </div>

        <form className="flex items-end gap-2">
          <input type="hidden" name="periodo" value="personalizado" />
          <div>
            <label className="mb-1 block text-xs text-gray-500">De</label>
            <input
              type="date"
              name="de"
              defaultValue={de}
              min={minDataPersonalizada}
              max={maxDataPersonalizada}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Até</label>
            <input
              type="date"
              name="ate"
              defaultValue={ate}
              min={minDataPersonalizada}
              max={maxDataPersonalizada}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Período personalizado
          </button>
        </form>
      </div>

      <p className="mb-4 text-xs text-gray-400">
        Período: {new Date(de + "T00:00:00").toLocaleDateString("pt-BR")} até{" "}
{new Date(ate + "T00:00:00").toLocaleDateString("pt-BR")} · o Mercado Ads permite consultar até{" "}
{LIMITE_DIAS_ADS} dias anteriores a hoje
      </p>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-6">
        <div className="rounded border border-t-4 border-t-[var(--color-sixxis-navy)] border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Vendas atribuídas</p>
          <p className="text-xl font-bold text-gray-900">{unitsTotal.toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">ROAS</p>
          <p className="text-xl font-bold text-gray-900">{roasGeral.toFixed(2)}x</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Receita</p>
          <p className="text-xl font-bold text-gray-900">{formatarMoeda(vendasTotal, moeda)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Investimento</p>
          <p className="text-xl font-bold text-gray-900">{formatarMoeda(investimentoTotal, moeda)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Cliques</p>
          <p className="text-xl font-bold text-gray-900">{cliquesTotal.toLocaleString("pt-BR")}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Impressões</p>
          <p className="text-xl font-bold text-gray-900">{impressoesTotal.toLocaleString("pt-BR")}</p>
        </div>
      </div>

      {/* Campanhas -- espelho do layout do Mercado Ads: tabela unica
          ordenada por investimento, com diagnostico calculado por nos
          (o diagnostico nativo do ML nao e exposto pela API publica) e
          link direto para editar a campanha no proprio Mercado Ads. */}
      <details className="mb-8 rounded border border-gray-200 bg-white">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-gray-700">
          Extrato de campanhas ({todasCampanhas.length})
        </summary>
        <div className="overflow-x-auto border-t border-gray-200">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-400">
              <th className="px-4 py-2 font-medium">Campanha</th>
              <th className="px-4 py-2 font-medium">Diagnóstico</th>
              <th className="px-4 py-2 font-medium">Orçamento/dia</th>
              <th className="px-4 py-2 font-medium">ROAS Objetivo</th>
              <th className="px-4 py-2 font-medium">Vendas</th>
              <th className="px-4 py-2 font-medium">ROAS</th>
              <th className="px-4 py-2 font-medium">ACOS</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {todasCampanhas
              .slice()
              .sort((a, b) => b.metricas.cost - a.metricas.cost)
              .map((c) => {
                const ativa = c.status === "active";
                const razao =
                  c.roasObjetivo && c.roasObjetivo > 0 ? c.metricas.roas / c.roasObjetivo : null;
                const diagnostico = !ativa
                  ? { label: "Pausada", cor: "text-gray-400" }
                  : razao !== null
                  ? razao >= 1.1
                    ? { label: "Excelente", cor: "text-green-600" }
                    : razao >= 1
                    ? { label: "Bom", cor: "text-green-600" }
                    : razao >= 0.7
                    ? { label: "Regular", cor: "text-yellow-600" }
                    : { label: "Crítico", cor: "text-red-600" }
                  : c.metricas.roas >= 8
                  ? { label: "Excelente", cor: "text-green-600" }
                  : c.metricas.roas >= 4
                  ? { label: "Bom", cor: "text-green-600" }
                  : c.metricas.roas >= 2
                  ? { label: "Regular", cor: "text-yellow-600" }
                  : { label: "Crítico", cor: "text-red-600" };
                return (
                  <tr key={c.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2">
                      <span
                        className="mr-2 inline-block h-2 w-2 rounded-full align-middle"
                        style={{ backgroundColor: c.contaCor }}
                      />
                      <span className="align-middle text-gray-900">{c.nome}</span>
                      <span className="ml-1 align-middle text-xs text-gray-400">· {c.contaNickname}</span>
                    </td>
                    <td className={`px-4 py-2 font-medium ${diagnostico.cor}`}>{diagnostico.label}</td>
                    <td className="px-4 py-2 text-gray-700">{formatarMoeda(c.orcamento, c.moeda)}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {c.roasObjetivo ? `${c.roasObjetivo.toFixed(0)}x` : "—"}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{formatarMoeda(c.metricas.total_amount, c.moeda)}</td>
                    <td className="px-4 py-2 font-medium text-gray-900">{c.metricas.roas.toFixed(2)}x</td>
                    <td className="px-4 py-2 text-gray-700">{c.metricas.acos.toFixed(1)}%</td>
                    <td className="px-4 py-2 text-right">
                      <a
                        href={`https://ads.mercadolivre.com.br/product-ads/admin/campaigns/${c.id}/dashboard`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-[var(--color-sixxis-navy)] hover:underline"
                      >
                        Editar no Mercado Ads ↗
                      </a>
                    </td>
                  </tr>
                );
              })}
            {todasCampanhas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-gray-400">
                  Nenhuma campanha no período selecionado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </details>

      {/* Campanhas + ranking de anuncios reais por conta, ordem fixa */}
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Campanhas e anúncios por conta</h2>
{contasComCampanhas.length === 0 ? (
          <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
            Nenhuma conta Mercado Livre conectada ainda.
                      </div>
       ) : (
                 <PublicidadePorConta contas={contasComCampanhas} />
       )}
    </div>
  );
}
