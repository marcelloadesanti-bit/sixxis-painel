import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getPromocoesVendedor, type Promocao } from "@/lib/mercadolivre/promotions";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import PromocoesPorConta, { type ContaComPromocoes } from "./promocoes-por-conta";

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
    .select("id, ml_user_id, nickname, apelido, cor")
    .order("nickname", { ascending: true });

  const resultados = await Promise.all(
    (contas ?? []).map(async (conta) => {
      const nome = nomeConta(conta);
      try {
        const promocoes = await getPromocoesVendedor(
          await getValidAccessToken(conta.id),
          conta.ml_user_id,
          conta.id,
          nome
        );
        return { conta, nome, promocoes, erro: null as string | null };
      } catch (err) {
        console.error(`Erro ao buscar promoções de ${conta.nickname}:`, err);
        return { conta, nome, promocoes: [] as Promocao[], erro: "Falha ao buscar promoções desta conta." };
      }
    })
  );

  const contasComPromocoes: ContaComPromocoes[] = resultados.map((r) => ({
    id: r.conta.id as string,
    nome: r.nome,
    cor: (r.conta.cor as string) ?? COR_PADRAO,
    erro: r.erro,
    ativas: r.promocoes.filter((p) => p.status === "started"),
    pendentes: r.promocoes.filter((p) => p.status === "pending" || p.status === "candidate"),
    outras: r.promocoes.filter((p) => !["started", "pending", "candidate"].includes(p.status)),
  }));

  const totalPendentes = contasComPromocoes.reduce((acc, c) => acc + c.pendentes.length, 0);
  const totalAtivas = contasComPromocoes.reduce((acc, c) => acc + c.ativas.length, 0);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Central de promoções</h1>
      <p className="mb-6 text-sm text-gray-500">
        Ofertas, descontos e campanhas de cada uma das {contas?.length ?? 0} contas conectadas. Clique no
        nome de uma conta para ver os detalhes.
        {totalPendentes > 0 && (
          <>
            {" "}
            <span className="font-medium text-yellow-700">
              {totalPendentes} convite{totalPendentes === 1 ? "" : "s"} pendente{totalPendentes === 1 ? "" : "s"} no total.
            </span>
          </>
        )}
        {totalAtivas > 0 && ` ${totalAtivas} promoção${totalAtivas === 1 ? "" : "ões"} ativa${totalAtivas === 1 ? "" : "s"} no total.`}
      </p>

      {contasComPromocoes.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Nenhuma conta Mercado Livre conectada ainda.
        </div>
      ) : (
        <PromocoesPorConta contas={contasComPromocoes} />
      )}
    </div>
  );
}
