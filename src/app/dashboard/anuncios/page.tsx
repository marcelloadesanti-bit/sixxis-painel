import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getSerieDiariaVisitas } from "@/lib/mercadolivre/visits";
import { listarAnunciosResumo, type OrdenacaoAnuncios } from "@/lib/mercadolivre/items";
import { PRESETS, type PresetKey, periodoDoPreset } from "@/lib/date-utils";
import { COR_PADRAO } from "@/lib/account-colors";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import AnunciosFiltros from "./anuncios-filtros";
import AnunciosGrafico from "./anuncios-grafico";
import AnunciosTabela from "./anuncios-tabela";

const OPCOES_ORDENACAO: { key: OrdenacaoAnuncios; label: string }[] = [
  { key: "modificados_recente", label: "Modificados recentemente" },
  { key: "criados_recente", label: "Criados recentemente" },
  { key: "mais_vendidos", label: "Mais vendidos" },
  { key: "mais_visualizados", label: "Mais visualizados" },
];

export default async function AnunciosPage({
  searchParams,
}: {
  searchParams: Promise<{
    ordenar?: string;
    pagina?: string;
    contas?: string;
    periodo?: string;
  }>;
}) {
  const { podeEditar } = await exigirAcessoSecao("anuncios", "resumo_anuncios");
  const params = await searchParams;

  const ordenacao = (OPCOES_ORDENACAO.some((o) => o.key === params.ordenar)
    ? params.ordenar
    : "modificados_recente") as OrdenacaoAnuncios;
  const pagina = Math.max(1, Number(params.pagina) || 1);
  const preset = (PRESETS.some((p) => p.key === params.periodo) ? params.periodo : "7dias") as PresetKey;

  const supabase = await createClient();
  const { data: contasRaw } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname, cor")
    .order("nickname", { ascending: true });

  const todasContas = (contasRaw ?? []).map((c) => ({
    id: c.id as string,
    ml_user_id: String(c.ml_user_id),
    nickname: c.nickname as string,
    cor: (c.cor as string) ?? COR_PADRAO,
  }));

  const idsSelecionados = params.contas ? params.contas.split(",").filter(Boolean) : todasContas.map((c) => c.id);
  const contasSelecionadas = todasContas.filter((c) => idsSelecionados.includes(c.id));
  const contasParaBusca = contasSelecionadas.length > 0 ? contasSelecionadas : todasContas;

  const contasComToken = await Promise.all(
    contasParaBusca.map(async (conta) => ({
      conta,
      accessToken: await getValidAccessToken(conta.id),
    }))
  );

  const { de, ate } = periodoDoPreset(preset, new Date());

  let linhas: Awaited<ReturnType<typeof listarAnunciosResumo>>["linhas"] = [];
  let total = 0;
  let erroLista: string | null = null;

  try {
    const resultado = await listarAnunciosResumo(contasComToken, ordenacao, pagina, { de, ate }, 25);
    linhas = resultado.linhas;
    total = resultado.total;
  } catch (err) {
    console.error("Erro ao listar anuncios:", err);
    erroLista = "Não foi possível carregar os anúncios agora.";
  }

  let seriesVisitas: { contaId: string; nickname: string; cor: string; pontos: { data: string; total: number }[] }[] = [];
  try {
    seriesVisitas = await Promise.all(
      contasComToken.map(async ({ conta, accessToken }) => ({
        contaId: conta.id,
        nickname: conta.nickname,
        cor: conta.cor,
        pontos: await getSerieDiariaVisitas(accessToken, Number(conta.ml_user_id), de, ate),
      }))
    );
  } catch (err) {
    console.error("Erro ao buscar series de visitas dos anuncios:", err);
  }

  const totalPaginas = Math.max(1, Math.ceil(total / 25));

  return (
    <div className="mx-auto max-w-7xl p-6">
      <div className="mb-1 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-sixxis-navy)]">Anúncios</h1>
        {podeEditar && (
          <a
            href="/dashboard/anuncios/criar"
            className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
          >
            + Criar anúncio
          </a>
        )}
      </div>
      <p className="mb-6 text-sm text-gray-500">
        Resumo consolidado de {todasContas.length} conta{todasContas.length === 1 ? "" : "s"} conectada
        {todasContas.length === 1 ? "" : "s"}
      </p>

      <AnunciosFiltros
        opcoesOrdenacao={OPCOES_ORDENACAO}
        ordenacaoAtual={ordenacao}
        todasContas={todasContas}
        contasSelecionadas={idsSelecionados}
        presets={PRESETS}
        presetAtual={preset}
      />

      <div className="my-6 rounded border border-gray-200 bg-white p-4">
        <p className="mb-3 text-sm font-semibold text-gray-700">
          Visitas por conta · últimos {preset === "diario" ? "1 dia" : preset.replace("dias", " dias")}
        </p>
        <AnunciosGrafico series={seriesVisitas} />
      </div>

      {erroLista && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{erroLista}</p>}

      <AnunciosTabela linhas={linhas} periodoLabel={PRESETS.find((p) => p.key === preset)?.label} />

      {totalPaginas > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-1">
          {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((p) => {
            const query = new URLSearchParams({
              ordenar: ordenacao,
              periodo: preset,
              contas: idsSelecionados.join(","),
              pagina: String(p),
            });
            return (
              <a
                key={p}
                href={`/dashboard/anuncios?${query.toString()}`}
                className={`rounded px-3 py-1.5 text-xs font-medium ${
                  p === pagina
                    ? "bg-[var(--color-sixxis-navy)] text-white"
                    : "border border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {p}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
