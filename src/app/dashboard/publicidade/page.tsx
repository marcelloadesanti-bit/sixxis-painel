import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getAnunciantes, getCampanhas, type Campanha, type Anunciante } from "@/lib/mercadolivre/ads";
import { getTotaisPorStatus, periodoDeDatas } from "@/lib/mercadolivre/orders";
import { PRESETS, type PresetKey, periodoDoPreset } from "@/lib/date-utils";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import PublicidadePorConta, { type ContaComCampanhas, type CampanhaFormatada } from "./publicidade-por-conta";

const formatarMoeda = (valor: number, moeda: string = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(valor);

const formatarPct = (valor: number | null, casas = 1) => (valor !== null ? `${valor.toFixed(casas)}%` : "—");
const formatarRoas = (valor: number | null) => (valor !== null ? `${valor.toFixed(2)}x` : "—");

// Ordem fixa (nao alfabetica) pedida especificamente para a tela de Ads --
// as demais telas (Pos-venda, Promocoes) continuam ordenadas por nickname.
const ORDEM_CONTAS_ADS = ["SIXXISARBRASIL", "SIXXIS", "SIXXISBR", "SIXXISBRASIL", "BRASILSIXXIS"];
const posicaoConta = (nickname: string) => {
  const i = ORDEM_CONTAS_ADS.indexOf(nickname);
  return i === -1 ? 999 : i;
};

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

// Anuncio individual (nivel "product ad", nao campanha) com melhor
// desempenho no periodo, cross-conta. A API do Mercado Ads hoje so nos da
// metricas por CAMPANHA (ver src/lib/mercadolivre/ads.ts) -- o endpoint de
// metricas por anuncio/item ainda precisa ser integrado. Os dados abaixo sao
// ilustrativos, so para validar o layout; ficam claramente marcados como tal
// na tela (ver aviso "Dados de exemplo" no render).
type AnuncioTop = {
  codigo: string;
  titulo: string;
  contaNome: string;
  contaCor: string;
  cliques: number;
  investimentoLabel: string;
  vendasLabel: string;
  roasLabel: string;
};

function gerarTopAnunciosMock(contas: { nome: string; cor: string }[]): AnuncioTop[] {
  if (contas.length === 0) return [];
  const produtos = [
    "Kit 3 Fones Bluetooth TWS",
    "Carregador Turbo 33W USB-C",
    "Capinha Anti-Impacto iPhone",
    "Suporte Veicular Magnético",
    "Cabo USB-C 2m Reforçado",
    "Power Bank 20000mAh",
    "Smartwatch Esportivo",
    "Caixa de Som Portátil",
    "Mouse Sem Fio Silencioso",
    "Organizador de Cabos",
  ];
  return produtos.map((titulo, i) => {
    const conta = contas[i % contas.length];
    const investimento = 320 - i * 22;
    const roas = 12 - i * 0.8;
    return {
      codigo: `MLB${(4200000000 + i * 137).toString()}`,
      titulo,
      contaNome: conta.nome,
      contaCor: conta.cor,
      cliques: 480 - i * 31,
      investimentoLabel: formatarMoeda(investimento),
      vendasLabel: formatarMoeda(Math.round(investimento * roas)),
      roasLabel: formatarRoas(roas),
    };
  });
}

export default async function PublicidadePage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string }>;
}) {
  await exigirAcessoSecao("publicidade");
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
    ? { de: params.de!, ate: params.ate! }
    : periodoDoPreset(presetSelecionado, hoje);

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

  // Busca anunciantes uma unica vez por conta e reaproveita para as duas
  // janelas de tempo (mes corrente, para "Metas em andamento", e periodo
  // filtrado na tela, para os cards consolidados + campanhas por conta).
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
            investimentoMes: 0,
            vendasAdsMes: 0,
            faturamentoMes: 0,
            erro: null as string | null,
          };
        }

        const [listasPeriodo, listasMes, pagasMes, canceladasMes] = await Promise.all([
          Promise.all(anunciantes.map((a) => getCampanhas(accessToken, a.siteId, a.advertiserId, de, ate))),
          Promise.all(
            anunciantes.map((a) => getCampanhas(accessToken, a.siteId, a.advertiserId, primeiroDiaMes, hojeStr))
          ),
          getTotaisPorStatus(accessToken, conta.ml_user_id, periodoMes, "paid"),
          getTotaisPorStatus(accessToken, conta.ml_user_id, periodoMes, "cancelled"),
        ]);

        const campanhasPeriodo = listasPeriodo.flatMap((r) => r.campanhas);
        const campanhasMes = listasMes.flatMap((r) => r.campanhas);
        const investimentoMes = campanhasMes.reduce((s, c) => s + c.metricas.cost, 0);
        const vendasAdsMes = campanhasMes.reduce((s, c) => s + c.metricas.total_amount, 0);
        const faturamentoMes = pagasMes.valor + canceladasMes.valor;

        return {
          conta,
          semAnuncios: false,
          campanhasPeriodo,
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
    r.campanhasPeriodo.map((c) => ({ ...c, contaNickname: nomeConta(r.conta) }))
  );
  const investimentoTotal = todasCampanhas.reduce((s, c) => s + c.metricas.cost, 0);
  const cliquesTotal = todasCampanhas.reduce((s, c) => s + c.metricas.clicks, 0);
  const impressoesTotal = todasCampanhas.reduce((s, c) => s + c.metricas.prints, 0);
  const vendasTotal = todasCampanhas.reduce((s, c) => s + c.metricas.total_amount, 0);
  const moeda = todasCampanhas[0]?.moeda ?? "BRL";
  const acosMedio = vendasTotal > 0 ? (investimentoTotal / vendasTotal) * 100 : 0;

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

  // --- Top 10 anuncios (mock -- ver comentario acima de gerarTopAnunciosMock) ---
  const contasParaMock = (contas ?? []).map((c) => ({ nome: nomeConta(c), cor: (c.cor as string) ?? COR_PADRAO }));
  const topAnuncios = gerarTopAnunciosMock(contasParaMock);

  // --- Campanhas por conta, ordem fixa (so nesta tela) ---
  const contasComCampanhas: ContaComCampanhas[] = resultados
    .slice()
    .sort((a, b) => posicaoConta(a.conta.nickname as string) - posicaoConta(b.conta.nickname as string))
    .map((r) => {
      const campanhas: CampanhaFormatada[] = r.campanhasPeriodo.map((c) => ({
        id: c.id,
        nome: c.nome,
        status: c.status,
        investimentoLabel: formatarMoeda(c.metricas.cost, c.moeda),
        cliques: c.metricas.clicks,
        ctrLabel: `${(c.metricas.ctr * 100).toFixed(2)}%`,
        acosLabel: `${c.metricas.acos.toFixed(1)}%`,
        roasLabel: formatarRoas(c.metricas.roas),
        vendasLabel: formatarMoeda(c.metricas.total_amount, c.moeda),
      }));
      return {
        id: r.conta.id as string,
        nome: nomeConta(r.conta),
        cor: (r.conta.cor as string) ?? COR_PADRAO,
        erro: r.erro,
        semAnuncios: r.semAnuncios,
        campanhas,
      };
    });

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Publicidade</h1>
      <p className="mb-6 text-sm text-gray-500">
        Mercado Ads — campanhas consolidadas de todas as {contas?.length ?? 0} contas
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
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

      <p className="mb-4 text-xs text-gray-400">
        Período: {new Date(de + "T00:00:00").toLocaleDateString("pt-BR")} até{" "}
        {new Date(ate + "T00:00:00").toLocaleDateString("pt-BR")}
      </p>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded border border-t-4 border-t-[var(--color-sixxis-navy)] border-gray-200 bg-white p-4">
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
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Vendas por Ads</p>
          <p className="text-xl font-bold text-gray-900">{formatarMoeda(vendasTotal, moeda)}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">ACOS médio</p>
          <p className="text-xl font-bold text-gray-900">{acosMedio.toFixed(1)}%</p>
        </div>
      </div>

      {/* Metas em andamento -- sempre mes corrente, todas as contas, real */}
      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        Metas em andamento <span className="font-normal text-gray-400">— mês corrente</span>
      </h2>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cardsMeta.map((card) => (
          <CardMetaAndamento key={card.titulo} card={card} />
        ))}
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Orçamento mensal (referência)</p>
          <p className="text-xl font-bold text-gray-900">{formatarMoeda(investimentoAdsMesTotal)}</p>
          {orcamentoMensal !== null ? (
            <>
              <p className="text-xs text-gray-400">
                de {formatarMoeda(orcamentoMensal)} · {pctOrcamento!.toFixed(0)}% usado
              </p>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-[var(--color-sixxis-blue)] transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, pctOrcamento!))}%` }}
                />
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">
              Orçamento não definido ·{" "}
              <a href="/dashboard/configuracoes/metas?aba=ads" className="text-[var(--color-sixxis-blue)] underline">
                definir
              </a>
            </p>
          )}
        </div>
      </div>

      {/* Top 10 anuncios patrocinados -- metrica de desempenho, cross-conta */}
      <h2 className="mb-1 text-sm font-semibold text-gray-700">Top 10 anúncios patrocinados</h2>
      <p className="mb-2 text-xs text-amber-600">
        Dados de exemplo — a integração por anúncio individual da API do Mercado Ads ainda não está vinculada.
        Layout pronto para os dados reais assim que estiver disponível.
      </p>
      <div className="mb-8 overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-400">
              <th className="p-3">#</th>
              <th className="p-3">Anúncio</th>
              <th className="p-3 text-right">Cliques</th>
              <th className="p-3 text-right">Investimento</th>
              <th className="p-3 text-right">ROAS</th>
              <th className="p-3 text-right">Vendas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {topAnuncios.map((a, i) => (
              <tr key={a.codigo}>
                <td className="p-3 text-gray-400">{i + 1}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                      style={{ backgroundColor: a.contaCor }}
                      title={a.contaNome}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-800">{a.titulo}</p>
                      <p className="text-xs text-gray-400">
                        {a.codigo} · {a.contaNome}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="p-3 text-right">{a.cliques}</td>
                <td className="p-3 text-right">{a.investimentoLabel}</td>
                <td className="p-3 text-right">{a.roasLabel}</td>
                <td className="p-3 text-right">{a.vendasLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Campanhas reais por conta, ordem fixa */}
      <h2 className="mb-2 text-sm font-semibold text-gray-700">Campanhas por conta</h2>
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
