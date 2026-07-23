import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getResumoVendas } from "@/lib/mercadolivre/orders";
import LogoutButton from "./logout-button";

type ContaComResumo = {
  id: string;
  ml_user_id: number;
  nickname: string;
  site_id: string;
  created_at: string;
  vendas?: {
    totalPedidos: number;
    valorSomado: number;
    amostraParcial: boolean;
    moeda: string | null;
  };
  erroVendas?: string;
};

const formatarMoeda = (valor: number, moeda: string | null) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda ?? "BRL",
  }).format(valor);

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ conectado?: string; erro?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: contasBase } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname, site_id, created_at")
    .order("created_at", { ascending: true });

  const isAdmin = profile?.role === "admin";

  // Busca o resumo de vendas (ultimos 30 dias) de cada conta em paralelo.
  // Se uma conta falhar (token invalido, API fora do ar, etc.), as demais
  // continuam funcionando normalmente.
  const contas: ContaComResumo[] = await Promise.all(
    (contasBase ?? []).map(async (conta) => {
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const vendas = await getResumoVendas(accessToken, conta.ml_user_id);
        return { ...conta, vendas };
      } catch (err) {
        console.error(`Erro ao buscar vendas da conta ${conta.nickname}:`, err);
        return { ...conta, erroVendas: "Não foi possível carregar as vendas agora." };
      }
    })
  );

  const totalPedidosConsolidado = contas.reduce(
    (soma, c) => soma + (c.vendas?.totalPedidos ?? 0),
    0
  );
  const totalValorConsolidado = contas.reduce(
    (soma, c) => soma + (c.vendas?.valorSomado ?? 0),
    0
  );
  const moedaConsolidada = contas.find((c) => c.vendas?.moeda)?.vendas?.moeda ?? "BRL";

  return (
    <main className="mx-auto min-h-screen max-w-4xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-sixxis-navy)]">
            Painel Sixxis
          </h1>
          <p className="text-sm text-gray-500">
            {profile?.full_name ?? user.email} ·{" "}
            {isAdmin ? "Administrador" : "Colaborador"}
          </p>
        </div>
        <LogoutButton />
      </div>

      {params.conectado && (
        <p className="mb-4 rounded bg-green-50 p-3 text-sm text-green-700">
          Conta &quot;{params.conectado}&quot; conectada com sucesso.
        </p>
      )}
      {params.erro && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{params.erro}</p>
      )}

      {contas.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-4">
          <div className="rounded border border-gray-200 p-4">
            <p className="text-xs uppercase text-gray-400">Pedidos pagos (30 dias)</p>
            <p className="text-2xl font-bold text-gray-900">{totalPedidosConsolidado}</p>
          </div>
          <div className="rounded border border-gray-200 p-4">
            <p className="text-xs uppercase text-gray-400">Valor vendido (30 dias)</p>
            <p className="text-2xl font-bold text-gray-900">
              {formatarMoeda(totalValorConsolidado, moedaConsolidada)}
            </p>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">
          Contas Mercado Livre conectadas ({contas.length})
        </h2>
        {isAdmin && (
          <a
            href="/api/mercadolivre/connect"
            className="rounded bg-[var(--color-sixxis-navy)] px-3 py-2 text-sm font-medium text-white"
          >
            + Conectar conta
          </a>
        )}
      </div>

      {contas.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Nenhuma conta Mercado Livre conectada ainda.
          {isAdmin && " Clique em \"Conectar conta\" para autorizar a primeira."}
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {contas.map((conta) => (
            <li key={conta.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900">{conta.nickname}</p>
                <p className="text-xs text-gray-500">
                  ID {conta.ml_user_id} · Site {conta.site_id}
                </p>
                {conta.vendas && (
                  <p className="mt-1 text-xs text-gray-600">
                    {conta.vendas.totalPedidos} pedidos pagos (30 dias) ·{" "}
                    {formatarMoeda(conta.vendas.valorSomado, conta.vendas.moeda)}
                    {conta.vendas.amostraParcial && " (parcial)"}
                  </p>
                )}
                {conta.erroVendas && (
                  <p className="mt-1 text-xs text-red-500">{conta.erroVendas}</p>
                )}
              </div>
              <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                Conectada
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 grid grid-cols-2 gap-4 text-sm text-gray-400 sm:grid-cols-4">
        <div className="rounded border border-gray-100 p-4">Anúncios (em breve)</div>
        <div className="rounded border border-gray-100 p-4">Mercado Ads (em breve)</div>
        <div className="rounded border border-gray-100 p-4">Perguntas/Mensagens (em breve)</div>
        <div className="rounded border border-gray-100 p-4">Relatórios (em breve)</div>
      </div>
    </main>
  );
}
