import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getAnunciantes, getCampanhas, type Campanha } from "@/lib/mercadolivre/ads";
import { PRESETS, type PresetKey, periodoDoPreset } from "@/lib/date-utils";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";

const formatarMoeda = (valor: number, moeda: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(valor);

const STATUS_LABELS: Record<string, { label: string; cor: string }> = {
  active: { label: "Ativa", cor: "bg-green-50 text-green-700" },
  paused: { label: "Pausada", cor: "bg-gray-100 text-gray-600" },
  deleted: { label: "Removida", cor: "bg-red-50 text-red-600" },
};

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
    .select("id, ml_user_id, nickname")
    .order("nickname", { ascending: true });

  const resultados = await Promise.all(
    (contas ?? []).map(async (conta) => {
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const anunciantes = await getAnunciantes(accessToken);

        if (anunciantes.length === 0) {
          return { conta, semAnuncios: true, campanhas: [] as Campanha[], erro: null as string | null };
        }

        const listasPorAnunciante = await Promise.all(
          anunciantes.map((a) => getCampanhas(accessToken, a.siteId, a.advertiserId, de, ate))
        );
        const campanhas = listasPorAnunciante.flatMap((r) => r.campanhas);

        return { conta, semAnuncios: false, campanhas, erro: null as string | null };
      } catch (err) {
        console.error(`Erro ao buscar publicidade de ${conta.nickname}:`, err);
        return {
          conta,
          semAnuncios: false,
          campanhas: [] as Campanha[],
          erro: "Falha ao buscar dados de Mercado Ads desta conta.",
        };
      }
    })
  );

  const todasCampanhas = resultados.flatMap((r) =>
    r.campanhas.map((c) => ({ ...c, contaNickname: r.conta.nickname }))
  );

  const investimentoTotal = todasCampanhas.reduce((s, c) => s + c.metricas.cost, 0);
  const cliquesTotal = todasCampanhas.reduce((s, c) => s + c.metricas.clicks, 0);
  const impressoesTotal = todasCampanhas.reduce((s, c) => s + c.metricas.prints, 0);
  const vendasTotal = todasCampanhas.reduce((s, c) => s + c.metricas.total_amount, 0);
  const moeda = todasCampanhas[0]?.moeda ?? "BRL";
  const acosMedio = vendasTotal > 0 ? (investimentoTotal / vendasTotal) * 100 : 0;

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

      <h2 className="mb-2 text-sm font-semibold text-gray-700">Campanhas</h2>
      {todasCampanhas.length === 0 ? (
        <p className="mb-8 text-sm text-gray-400">
          Nenhuma campanha de Mercado Ads encontrada no período selecionado.
        </p>
      ) : (
        <div className="mb-8 overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-400">
                <th className="p-3">Campanha</th>
                <th className="p-3">Conta</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Investimento</th>
                <th className="p-3 text-right">Cliques</th>
                <th className="p-3 text-right">CTR</th>
                <th className="p-3 text-right">ACOS</th>
                <th className="p-3 text-right">Vendas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {todasCampanhas.map((c) => {
                const status = STATUS_LABELS[c.status] ?? { label: c.status, cor: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={`${c.contaNickname}-${c.id}`}>
                    <td className="p-3 font-medium text-gray-800">{c.nome}</td>
                    <td className="p-3 text-gray-500">{c.contaNickname}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${status.cor}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="p-3 text-right">{formatarMoeda(c.metricas.cost, c.moeda)}</td>
                    <td className="p-3 text-right">{c.metricas.clicks}</td>
                    <td className="p-3 text-right">{(c.metricas.ctr * 100).toFixed(2)}%</td>
                    <td className="p-3 text-right">{c.metricas.acos.toFixed(1)}%</td>
                    <td className="p-3 text-right">{formatarMoeda(c.metricas.total_amount, c.moeda)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resultados.some((r) => r.semAnuncios) && (
        <p className="mb-4 text-xs text-gray-400">
          Contas sem Mercado Ads ativo:{" "}
          {resultados
            .filter((r) => r.semAnuncios)
            .map((r) => r.conta.nickname)
            .join(", ")}
        </p>
      )}

      {resultados.some((r) => r.erro) && (
        <ul className="mb-4 text-xs text-red-500">
          {resultados
            .filter((r) => r.erro)
            .map((r) => (
              <li key={r.conta.id}>
                {r.conta.nickname}: {r.erro}
              </li>
            ))}
        </ul>
      )}

      {(!contas || contas.length === 0) && (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Nenhuma conta Mercado Livre conectada ainda.
        </div>
      )}
    </div>
  );
}
