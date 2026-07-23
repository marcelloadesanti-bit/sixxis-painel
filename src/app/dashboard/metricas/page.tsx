import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getTotaisPorStatus, periodoDeDatas, type PeriodoISO } from "@/lib/mercadolivre/orders";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";

function formatarData(d: Date) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

const formatarMoeda = (valor: number, moeda: string | null) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda ?? "BRL",
  }).format(valor);

type PresetKey = "hoje" | "7dias" | "15dias" | "30dias" | "personalizado";

function periodoDoPreset(preset: PresetKey, hoje: Date): { de: string; ate: string } {
  const ate = formatarData(hoje);
  switch (preset) {
    case "hoje":
      return { de: ate, ate };
    case "7dias":
      return { de: formatarData(new Date(hoje.getTime() - 6 * 86400000)), ate };
    case "15dias":
      return { de: formatarData(new Date(hoje.getTime() - 14 * 86400000)), ate };
    case "30dias":
    default:
      return { de: formatarData(new Date(hoje.getTime() - 29 * 86400000)), ate };
  }
}

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "hoje", label: "Hoje" },
  { key: "7dias", label: "Últimos 7 dias" },
  { key: "15dias", label: "Últimos 15 dias" },
  { key: "30dias", label: "Últimos 30 dias" },
];

export default async function MetricasPage({
  searchParams,
}: {
  searchParams: Promise<{ periodo?: string; de?: string; ate?: string }>;
}) {
  await exigirAcessoSecao("vendas");
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const hoje = new Date();
  const presetSelecionado = (params.periodo as PresetKey) ?? "7dias";
  const isPersonalizado = presetSelecionado === "personalizado" && params.de && params.ate;

  const { de, ate } = isPersonalizado
    ? { de: params.de!, ate: params.ate! }
    : periodoDoPreset(presetSelecionado, hoje);

  const periodo: PeriodoISO = periodoDeDatas(de, ate);

  const { data: contasBase } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname")
    .order("nickname", { ascending: true });

  const resultados = await Promise.all(
    (contasBase ?? []).map(async (conta) => {
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const [pagas, canceladas] = await Promise.all([
          getTotaisPorStatus(accessToken, conta.ml_user_id, periodo, "paid"),
          getTotaisPorStatus(accessToken, conta.ml_user_id, periodo, "cancelled"),
        ]);
        return { conta, pagas, canceladas, erro: null as string | null };
      } catch (err) {
        console.error(`Erro ao buscar metricas de ${conta.nickname}:`, err);
        return { conta, pagas: null, canceladas: null, erro: "Falha ao buscar métricas." };
      }
    })
  );

  // "Faturamento bruto" no painel real do ML soma pedidos pagos + cancelados
  // do período (o cancelamento é informativo, não é descontado do bruto).
  const pedidosCancelados = resultados.reduce((s, r) => s + (r.canceladas?.quantidade ?? 0), 0);
  const valorCancelado = resultados.reduce((s, r) => s + (r.canceladas?.valor ?? 0), 0);
  const faturamentoBruto = resultados.reduce((s, r) => s + (r.pagas?.valor ?? 0), 0) + valorCancelado;
  const pedidosFeitos = resultados.reduce((s, r) => s + (r.pagas?.quantidade ?? 0), 0) + pedidosCancelados;
  const moeda = resultados.find((r) => r.pagas?.moeda)?.pagas?.moeda ?? "BRL";
  const ticketMedio = pedidosFeitos > 0 ? faturamentoBruto / pedidosFeitos : 0;

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-[var(--color-sixxis-blue)] underline">
          ← Voltar ao painel
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Métricas</h1>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Link
              key={p.key}
              href={`/dashboard/metricas?periodo=${p.key}`}
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
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Até</label>
            <input
              type="date"
              name="ate"
              defaultValue={ate}
              className="rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Data personalizada
          </button>
        </form>
      </div>

      <p className="mb-4 text-xs text-gray-400">
        Período: {new Date(de + "T00:00:00").toLocaleDateString("pt-BR")} até{" "}
        {new Date(ate + "T00:00:00").toLocaleDateString("pt-BR")} (horário de Brasília) ·{" "}
        <Link href="/dashboard/vendas" className="underline">
          ver extrato de pedidos
        </Link>
      </p>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded border border-t-4 border-t-[var(--color-sixxis-navy)] border-gray-200 p-4">
          <p className="text-xs uppercase text-gray-400">Faturamento bruto</p>
          <p className="text-xl font-bold text-gray-900">
            {formatarMoeda(faturamentoBruto, moeda)}
          </p>
        </div>
        <div className="rounded border border-gray-200 p-4">
          <p className="text-xs uppercase text-gray-400">Pedidos feitos</p>
          <p className="text-xl font-bold text-gray-900">{pedidosFeitos}</p>
        </div>
        <div className="rounded border border-gray-200 p-4">
          <p className="text-xs uppercase text-gray-400">Ticket médio</p>
          <p className="text-xl font-bold text-gray-900">{formatarMoeda(ticketMedio, moeda)}</p>
        </div>
        <div className="rounded border border-gray-200 p-4">
          <p className="text-xs uppercase text-gray-400">Pedidos cancelados</p>
          <p className="text-xl font-bold text-gray-900">{pedidosCancelados}</p>
          <p className="text-xs text-gray-400">{formatarMoeda(valorCancelado, moeda)}</p>
        </div>
      </div>

      <div className="mb-8 rounded border border-dashed border-gray-300 p-4 text-xs text-gray-500">
        Pedidos devolvidos: em desenvolvimento — a API de devoluções do Mercado Livre ainda
        está sendo validada para garantir que o número mostrado seja exato antes de aparecer aqui.
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-700">Por conta</h2>
      <ul className="divide-y divide-gray-200 rounded border border-gray-200">
        {resultados.map(({ conta, pagas, canceladas, erro }) => (
          <li key={conta.id} className="flex items-center justify-between p-4 text-sm">
            <span className="font-medium text-gray-800">{conta.nickname}</span>
            {pagas && canceladas ? (
              <span className="text-right text-gray-600">
                <span className="block">
                  {pagas.quantidade} pedidos · {formatarMoeda(pagas.valor, pagas.moeda)}
                </span>
                {canceladas.quantidade > 0 && (
                  <span className="block text-xs text-red-500">
                    {canceladas.quantidade} cancelados · {formatarMoeda(canceladas.valor, canceladas.moeda)}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-red-500">{erro}</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}
