import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getCampanhas, getTodosAnuncios, getMetricasAvancadasCampanha, type Anuncio } from "@/lib/mercadolivre/ads";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";

// Mesmo guard da Visao geral de Publicidade -- pagina de detalhe reutiliza a
// permissao da tela mae, sem item proprio no sidebar (mesmo padrao usado em
// detalhe de pedido e detalhe de anuncio em outras secoes).

const formatarMoeda = (valor: number, moeda: string = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(valor);
const formatarRoas = (valor: number | null) => (valor !== null ? `${valor.toFixed(2)}x` : "—");
const formatarPctFracao = (valor: number, casas = 1) => `${(valor <= 1 ? valor * 100 : valor).toFixed(casas)}%`;

const STATUS_LABELS: Record<string, { label: string; cor: string }> = {
  active: { label: "Ativa", cor: "bg-green-50 text-green-700" },
  paused: { label: "Pausada", cor: "bg-gray-100 text-gray-600" },
  deleted: { label: "Removida", cor: "bg-red-50 text-red-600" },
  hold: { label: "Bloqueado", cor: "bg-orange-50 text-orange-600" },
  idle: { label: "Ocioso", cor: "bg-gray-100 text-gray-500" },
  delegated: { label: "Delegado", cor: "bg-blue-50 text-blue-600" },
  revoked: { label: "Revogado", cor: "bg-gray-100 text-gray-500" },
};

function Campo({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-100">{valor}</p>
    </div>
  );
}

export default async function CampanhaDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ contaId: string; campanhaId: string }>;
  searchParams: Promise<{ site?: string; advertiser?: string; periodo?: string; de?: string; ate?: string }>;
}) {
  await exigirAcessoSecao("publicidade", "publicidade_visao_geral");
  const { contaId, campanhaId } = await params;
  const sp = await searchParams;

  const voltarParams = new URLSearchParams();
  if (sp.periodo) voltarParams.set("periodo", sp.periodo);
  if (sp.de) voltarParams.set("de", sp.de);
  if (sp.ate) voltarParams.set("ate", sp.ate);
  const hrefVoltar = `/dashboard/publicidade${voltarParams.toString() ? `?${voltarParams.toString()}` : ""}`;

  const campanhaIdNum = Number(campanhaId);
  const advertiserId = Number(sp.advertiser);
  const siteId = sp.site;

  if (!siteId || !advertiserId || Number.isNaN(campanhaIdNum)) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <Link href={hrefVoltar} className="text-sm text-[var(--color-sixxis-blue)] underline">
          ← Voltar para Publicidade
        </Link>
        <p className="mt-4 text-sm text-red-500">Link inválido para esta campanha.</p>
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: conta } = await supabase
    .from("ml_accounts")
    .select("id, nickname, apelido, cor")
    .eq("id", contaId)
    .maybeSingle();

  if (!conta) notFound();

  const hoje = new Date();
  const de = sp.de ?? hoje.toISOString().slice(0, 10);
  const ate = sp.ate ?? hoje.toISOString().slice(0, 10);

  let campanha: Awaited<ReturnType<typeof getCampanhas>>["campanhas"][number] | null = null;
  let anuncios: Anuncio[] = [];
  let avancadas: Awaited<ReturnType<typeof getMetricasAvancadasCampanha>> = null;
  let erro: string | null = null;

  try {
    const accessToken = await getValidAccessToken(contaId);
    const [{ campanhas }, todosAnuncios, avancadasResp] = await Promise.all([
      getCampanhas(accessToken, siteId, advertiserId, de, ate),
      getTodosAnuncios(accessToken, siteId, advertiserId, de, ate),
      getMetricasAvancadasCampanha(accessToken, siteId, campanhaIdNum, de, ate),
    ]);
    campanha = campanhas.find((c) => c.id === campanhaIdNum) ?? null;
    anuncios = todosAnuncios.filter((a) => a.campanhaId === campanhaIdNum).sort((a, b) => b.cost - a.cost);
    avancadas = avancadasResp;
  } catch (err) {
    console.error(`Erro ao buscar detalhe da campanha ${campanhaId}:`, err);
    erro = "Falha ao buscar dados desta campanha.";
  }

  const status = campanha
    ? STATUS_LABELS[campanha.status] ?? { label: campanha.status, cor: "bg-gray-100 text-gray-600" }
    : null;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <Link href={hrefVoltar} className="mb-4 inline-block text-sm text-[var(--color-sixxis-blue)] underline">
        ← Voltar para {nomeConta(conta)}
      </Link>

      {erro && <p className="mb-4 text-sm text-red-500">{erro}</p>}

      {!erro && !campanha && <p className="text-sm text-gray-500">Campanha não encontrada no período selecionado.</p>}

      {campanha && (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span
              className="h-3 w-3 shrink-0 rounded-full border border-black/10"
              style={{ backgroundColor: (conta.cor as string) ?? COR_PADRAO }}
            />
            <h1 className="text-xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">{campanha.nome}</h1>
            {status && (
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.cor}`}>
                {status.label}
              </span>
            )}
            <span className="text-xs text-gray-400">{nomeConta(conta)}</span>
          </div>

          <p className="mb-4 text-xs text-gray-400">
            Período: {new Date(de + "T00:00:00").toLocaleDateString("pt-BR")} até{" "}
            {new Date(ate + "T00:00:00").toLocaleDateString("pt-BR")}
          </p>

          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Campo label="Investimento" valor={formatarMoeda(campanha.metricas.cost, campanha.moeda)} />
            <Campo label="Cliques" valor={campanha.metricas.clicks.toLocaleString("pt-BR")} />
            <Campo label="CTR" valor={`${(campanha.metricas.ctr * 100).toFixed(2)}%`} />
            <Campo label="ACOS" valor={`${campanha.metricas.acos.toFixed(1)}%`} />
            <Campo label="ROAS" valor={formatarRoas(campanha.metricas.roas)} />
            <Campo label="Vendas" valor={formatarMoeda(campanha.metricas.total_amount, campanha.moeda)} />
            <Campo label="Orçamento/dia" valor={formatarMoeda(campanha.orcamento, campanha.moeda)} />
            <Campo label="ROAS objetivo" valor={campanha.roasObjetivo !== null ? formatarRoas(campanha.roasObjetivo) : "—"} />
          </div>

          {avancadas && (
            <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900/30">
              {avancadas.impressionShare != null && (
                <span>
                  Impressão captada:{" "}
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    {formatarPctFracao(avancadas.impressionShare)}
                  </span>
                </span>
              )}
              {avancadas.topImpressionShare != null && (
                <span>
                  Top impressão:{" "}
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    {formatarPctFracao(avancadas.topImpressionShare)}
                  </span>
                </span>
              )}
              {avancadas.lostShareOrcamento != null && (
                <span>
                  Perdida (orçamento):{" "}
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    {formatarPctFracao(avancadas.lostShareOrcamento)}
                  </span>
                </span>
              )}
              {avancadas.lostShareRanking != null && (
                <span>
                  Perdida (ranking):{" "}
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    {formatarPctFracao(avancadas.lostShareRanking)}
                  </span>
                </span>
              )}
              {avancadas.acosBenchmark != null && (
                <span>
                  ACOS benchmark:{" "}
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    {formatarPctFracao(avancadas.acosBenchmark)}
                  </span>
                </span>
              )}
            </div>
          )}

          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Anúncios desta campanha ({anuncios.length})
          </h2>
          {anuncios.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum anúncio com dados no período selecionado.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-[10px] uppercase text-gray-400 dark:border-gray-700">
                    <th className="p-2">#</th>
                    <th className="p-2">Anúncio</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Cliques</th>
                    <th className="p-2 text-right">Investimento</th>
                    <th className="p-2 text-right">ROAS</th>
                    <th className="p-2 text-right">Vendas</th>
                  </tr>
                </thead>
                <tbody>
                  {anuncios.map((a, i) => {
                    const st = STATUS_LABELS[a.status] ?? { label: a.status, cor: "bg-gray-100 text-gray-600" };
                    return (
                      <tr key={a.itemId} className="border-b border-gray-100 last:border-0 dark:border-gray-700">
                        <td className="p-2 text-xs text-gray-400">{i + 1}</td>
                        <td className="p-2">
                          <p className="max-w-[280px] truncate text-sm font-medium text-gray-800 dark:text-gray-100">
                            {a.titulo}
                          </p>
                          <p className="text-xs text-gray-400">{a.itemId}</p>
                        </td>
                        <td className="p-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${st.cor}`}>
                            {st.label}
                          </span>
                        </td>
                        <td className="p-2 text-right text-sm text-gray-600 dark:text-gray-300">{a.clicks}</td>
                        <td className="p-2 text-right text-sm text-gray-600 dark:text-gray-300">{formatarMoeda(a.cost)}</td>
                        <td className="p-2 text-right text-sm text-gray-600 dark:text-gray-300">{formatarRoas(a.roas)}</td>
                        <td className="p-2 text-right text-sm text-gray-600 dark:text-gray-300">
                          {formatarMoeda(a.totalAmount)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 text-right">
            <a
              href={`https://ads.mercadolivre.com.br/product-ads/admin/campaigns/${campanha.id}/dashboard`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-[var(--color-sixxis-navy)] hover:underline"
            >
              Editar no Mercado Ads ↗
            </a>
          </div>
        </>
      )}
    </div>
  );
}
