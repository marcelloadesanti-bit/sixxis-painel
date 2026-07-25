import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getPromocoesVendedor, type Promocao } from "@/lib/mercadolivre/promotions";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import PromocoesPorConta, { type ContaComPromocoes, type PromocaoFormatada } from "./promocoes-por-conta";

// Formata a data no servidor (nao no client component) para evitar mismatch de
// hidratacao: o fuso do servidor de build/SSR (UTC na Vercel) pode diferir do
// fuso do navegador de quem acessa, o que faz "Intl.DateTimeFormat" produzir
// texto diferente em cada lado para o mesmo instante -- erro React #418.
// Formatando aqui e passando string pronta pro client, o texto e identico
// nos dois lados porque nao ha formatacao nenhuma rodando no client.
const formatarData = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(iso)) : "—";

function formatarPromocao(p: Promocao): PromocaoFormatada {
  return {
    id: p.id,
    tipo: p.tipo,
    status: p.status,
    nome: p.nome,
    periodoLabel: `${formatarData(p.dataInicio)} – ${formatarData(p.dataFim)}`,
  };
}

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
    ativas: r.promocoes.filter((p) => p.status === "started").map(formatarPromocao),
    pendentes: r.promocoes
      .filter((p) => p.status === "pending" || p.status === "candidate")
      .map(formatarPromocao),
    outras: r.promocoes
      .filter((p) => !["started", "pending", "candidate"].includes(p.status))
      .map(formatarPromocao),
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
