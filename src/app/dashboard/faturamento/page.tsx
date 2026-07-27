import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getFaturamentoConta } from "@/lib/mercadolivre/billing";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import FaturamentoPorConta, {
  type ContaFaturamento,
  type ItemFaturamentoFormatado,
} from "./faturamento-por-conta";

// FASE 2 (verificação): a API de Faturamento (Billing) do Mercado Livre
// agora é chamada de verdade. Em 26/07/2026 um teste manual bateu na rota
// errada (/billing/monthly/periods, sem "/integration/") e recebeu 404 --
// por isso a Fase 1 ficou com o layout pronto mas sem dados. Em 27/07/2026
// corrigimos a rota (ver src/lib/mercadolivre/billing.ts), confirmamos que o
// escopo "Faturamento" do app já estava habilitado desde a criação, e
// reautorizamos as 5 contas para garantir tokens novos. Esta versão mostra
// os campos crus que a API devolve (sem tentar mapear para "disponível / a
// receber / retido", que são conceitos de saldo do Mercado Pago, não deste
// endpoint) -- é a etapa de confirmar que os dados reais importam antes de
// desenhar a versão final da tela.

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

const formatarData = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso)
  );

function formatarItens(itens: { label: string; valor: number }[]): ItemFaturamentoFormatado[] {
  return itens
    .slice()
    .sort((a, b) => b.valor - a.valor)
    .map((i) => ({ label: i.label, valorLabel: formatarMoeda(i.valor) }));
}

export default async function FaturamentoPage() {
  await exigirAcessoSecao("faturamento");
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
        const accessToken = await getValidAccessToken(conta.id as string);
        const dados = await getFaturamentoConta(accessToken, conta.ml_user_id as number);
        return { conta, nome, dados, erro: null as string | null };
      } catch (err) {
        console.error(`Erro ao buscar faturamento de ${conta.nickname}:`, err);
        return {
          conta,
          nome,
          dados: null,
          erro: err instanceof Error ? err.message : "Falha ao buscar faturamento desta conta.",
        };
      }
    })
  );

  const contasFaturamento: ContaFaturamento[] = resultados.map((r) => {
    if (r.erro) {
      return {
        id: r.conta.id as string,
        nome: r.nome,
        cor: (r.conta.cor as string) ?? COR_PADRAO,
        erro: r.erro,
        semPeriodo: false,
        periodoLabel: null,
        totalCobradoLabel: null,
        totalPercepcoesLabel: null,
        totalPagoLabel: null,
        totalNotaCreditoLabel: null,
        totalRecebidoLabel: null,
        totalDividaLabel: null,
        encargos: [],
        bonificacoes: [],
      };
    }

    if (!r.dados) {
      return {
        id: r.conta.id as string,
        nome: r.nome,
        cor: (r.conta.cor as string) ?? COR_PADRAO,
        erro: null,
        semPeriodo: true,
        periodoLabel: null,
        totalCobradoLabel: null,
        totalPercepcoesLabel: null,
        totalPagoLabel: null,
        totalNotaCreditoLabel: null,
        totalRecebidoLabel: null,
        totalDividaLabel: null,
        encargos: [],
        bonificacoes: [],
      };
    }

    const { resumo } = r.dados;
    return {
      id: r.conta.id as string,
      nome: r.nome,
      cor: (r.conta.cor as string) ?? COR_PADRAO,
      erro: null,
      semPeriodo: false,
      periodoLabel: `${formatarData(resumo.dataInicio)} – ${formatarData(resumo.dataFim)}`,
      totalCobradoLabel: formatarMoeda(resumo.totalCobrado),
      totalPercepcoesLabel: formatarMoeda(resumo.totalPercepcoes),
      totalPagoLabel: formatarMoeda(resumo.totalPago),
      totalNotaCreditoLabel: formatarMoeda(resumo.totalNotaCredito),
      totalRecebidoLabel: formatarMoeda(resumo.totalRecebidoConsolidado),
      totalDividaLabel: formatarMoeda(resumo.totalDivida),
      encargos: formatarItens(resumo.encargos),
      bonificacoes: formatarItens(resumo.bonificacoes),
    };
  });

  const contasComDados = resultados.filter((r) => r.dados);
  const totalCobrado = contasComDados.reduce((acc, r) => acc + (r.dados?.resumo.totalCobrado ?? 0), 0);
  const totalPago = contasComDados.reduce((acc, r) => acc + (r.dados?.resumo.totalPago ?? 0), 0);
  const totalDivida = contasComDados.reduce((acc, r) => acc + (r.dados?.resumo.totalDivida ?? 0), 0);
  const totalContasComErro = resultados.filter((r) => r.erro).length;
  const totalContasSemPeriodo = resultados.filter((r) => !r.erro && !r.dados).length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Faturamento</h1>
      <p className="mb-4 text-sm text-gray-500">
        Consolidado do período de faturamento mais recente das {contasFaturamento.length} contas
        conectadas ({contasComDados.length} com dados
        {totalContasSemPeriodo > 0 && `, ${totalContasSemPeriodo} sem período disponível`}
        {totalContasComErro > 0 && `, ${totalContasComErro} com falha na consulta`}).
      </p>

      <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/10 dark:text-blue-400">
        <span className="font-semibold">Fase de verificação:</span> esta tela já consulta a API real de
        Faturamento do Mercado Livre. Os campos abaixo ainda são os nomes originais da API (não
        &quot;disponível / a receber / retido&quot;) -- a versão final será desenhada depois de confirmarmos
        que os valores batem com o painel do Mercado Livre.
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Total cobrado no período</p>
          <p className="mt-2 text-2xl font-bold text-gray-800 dark:text-gray-100">{formatarMoeda(totalCobrado)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Total pago</p>
          <p className="mt-2 text-2xl font-bold text-gray-800 dark:text-gray-100">{formatarMoeda(totalPago)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Dívida em aberto</p>
          <p className="mt-2 text-2xl font-bold text-gray-800 dark:text-gray-100">{formatarMoeda(totalDivida)}</p>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-600 dark:text-gray-300">Por conta</h2>
      {contasFaturamento.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Nenhuma conta Mercado Livre conectada ainda.
        </div>
      ) : (
        <FaturamentoPorConta contas={contasFaturamento} />
      )}
    </div>
  );
}
