import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getPromocoesVendedor, labelTipoPromocao, type Promocao } from "@/lib/mercadolivre/promotions";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { nomeConta } from "@/lib/account-colors";

const formatarData = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "—";

const STATUS_LABELS: Record<string, { label: string; cor: string }> = {
  started: { label: "Ativa", cor: "bg-green-50 text-green-700" },
  pending: { label: "Pendente / convite", cor: "bg-yellow-50 text-yellow-700" },
  candidate: { label: "Candidata", cor: "bg-blue-50 text-blue-700" },
  finished: { label: "Encerrada", cor: "bg-gray-100 text-gray-500" },
};

export default async function PromocoesPage() {
  await exigirAcessoSecao("promocoes");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: contas } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname, apelido")
    .order("nickname", { ascending: true });

  const resultados = await Promise.all(
    (contas ?? []).map(async (conta) => {
      try {
        const promocoes = await getPromocoesVendedor(
          await getValidAccessToken(conta.id),
          conta.ml_user_id,
          conta.id,
          nomeConta(conta)
        );
        return { conta, promocoes, erro: null as string | null };
      } catch (err) {
        console.error(`Erro ao buscar promoções de ${conta.nickname}:`, err);
        return { conta, promocoes: [] as Promocao[], erro: "Falha ao buscar promoções desta conta." };
      }
    })
  );

  const todasPromocoes = resultados
    .flatMap((r) => r.promocoes)
    .sort((a, b) => (b.dataInicio ?? "").localeCompare(a.dataInicio ?? ""));

  const ativas = todasPromocoes.filter((p) => p.status === "started");
  const pendentes = todasPromocoes.filter((p) => p.status === "pending" || p.status === "candidate");
  const outras = todasPromocoes.filter((p) => !["started", "pending", "candidate"].includes(p.status));

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Central de promoções</h1>
      <p className="mb-6 text-sm text-gray-500">
        Ofertas, descontos e campanhas — consolidado de todas as {contas?.length ?? 0} contas conectadas
      </p>

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded border border-t-4 border-t-[var(--color-sixxis-navy)] border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Promoções ativas</p>
          <p className="text-xl font-bold text-gray-900">{ativas.length}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Convites pendentes</p>
          <p className="text-xl font-bold text-gray-900">{pendentes.length}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Total (todas as contas)</p>
          <p className="text-xl font-bold text-gray-900">{todasPromocoes.length}</p>
        </div>
      </div>

      {todasPromocoes.length === 0 ? (
        <p className="mb-8 text-sm text-gray-400">
          Nenhuma promoção encontrada. Convites para participar de campanhas aparecem aqui assim que
          o Mercado Livre os disponibilizar para alguma das contas conectadas.
        </p>
      ) : (
        <div className="mb-8 overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-400">
                <th className="p-3">Promoção</th>
                <th className="p-3">Tipo</th>
                <th className="p-3">Conta</th>
                <th className="p-3">Status</th>
                <th className="p-3">Início</th>
                <th className="p-3">Fim</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...ativas, ...pendentes, ...outras].map((p) => {
                const status = STATUS_LABELS[p.status] ?? { label: p.status, cor: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={`${p.contaId}-${p.id}-${p.tipo}`}>
                    <td className="p-3 font-medium text-gray-800">{p.nome ?? "—"}</td>
                    <td className="p-3 text-gray-500">{labelTipoPromocao(p.tipo)}</td>
                    <td className="p-3 text-gray-500">{p.contaNickname}</td>
                    <td className="p-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${status.cor}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500">{formatarData(p.dataInicio)}</td>
                    <td className="p-3 text-gray-500">{formatarData(p.dataFim)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {resultados.some((r) => r.erro) && (
        <ul className="mb-4 text-xs text-red-500">
          {resultados
            .filter((r) => r.erro)
            .map((r) => (
              <li key={r.conta.id}>
                {nomeConta(r.conta)}: {r.erro}
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
