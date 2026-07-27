import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getFaturamentoContaCacheado, type FaturamentoContaResultado } from "@/lib/mercadolivre/billing-cache";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import FaturamentoPorConta, {
  type ContaFaturamento,
  type ItemFaturamentoFormatado,
} from "./faturamento-por-conta";

// FASE 3 (cache + confiabilidade): a API de Faturamento do Mercado Livre
// aplica rate limit de 5 requisições por minuto, compartilhado entre as
// contas -- na Fase 2 isso derrubava algumas das 5 contas ao carregar a
// página (todas disparavam em paralelo). Agora: (1) os resultados ficam
// cacheados por conta na tabela faturamento_cache por até 12h (a própria
// documentação do ML recomenda no máximo um consumo diário, já que o valor
// não muda durante o dia); (2) contas com cache expirado são buscadas uma
// de cada vez (não em paralelo), com um intervalo de 13s entre CADA chamada
// (cada conta faz 2 chamadas -- períodos + resumo); (3) se mesmo assim bater
// rate limit, mostramos o último dado bom conhecido (com aviso de
// "desatualizado") em vez de erro.
//
// 27/07/2026: o time está no plano Hobby da Vercel, que mata a função do
// servidor em ~60s. Com 5 contas x 2 chamadas x 13s de intervalo, uma
// atualização completa levaria ~130s -- estouraria o timeout antes de
// terminar. Por isso limitamos a no máximo LIMITE_BUSCAS_AO_VIVO_POR_CARGA
// contas buscadas ao vivo POR CARREGAMENTO DE PÁGINA, priorizando sempre as
// contas com cache mais antigo primeiro. As demais continuam mostrando o
// último dado em cache (ou "pendente" se nunca foram buscadas). Clicar em
// "Atualizar" mais de uma vez (com alguns segundos de intervalo) completa a
// atualização das 5 contas em ~3 cliques, sem nunca estourar o timeout.
const LIMITE_BUSCAS_AO_VIVO_POR_CARGA = 2;

// Garante o teto de execução permitido pelo plano Hobby da Vercel (60s) --
// o padrão do Next.js pode ser menor (10-15s) e cortaria a página no meio
// de uma busca ao vivo.
export const maxDuration = 60;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

const formatarData = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso)
  );

const formatarDataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

function formatarItens(itens: { label: string; valor: number }[]): ItemFaturamentoFormatado[] {
  return itens
    .slice()
    .sort((a, b) => b.valor - a.valor)
    .map((i) => ({ label: i.label, valorLabel: formatarMoeda(i.valor) }));
}

export default async function FaturamentoPage({
  searchParams,
}: {
  searchParams: Promise<{ atualizar?: string }>;
}) {
  await exigirAcessoSecao("faturamento");
  const { atualizar } = await searchParams;
  const forcar = atualizar === "1";

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

  const contasLista = contas ?? [];

  // Para priorizar quais contas ganham as (poucas) buscas ao vivo permitidas
  // por carregamento, consultamos a idade do cache de todas de uma vez.
  // Contas sem cache (nunca buscadas) recebem prioridade máxima.
  const { data: cachesExistentes } = await supabase
    .from("faturamento_cache")
    .select("conta_id, atualizado_em");
  const idadeCachePorConta = new Map<string, number>();
  for (const c of cachesExistentes ?? []) {
    idadeCachePorConta.set(c.conta_id as string, Date.now() - new Date(c.atualizado_em as string).getTime());
  }
  const contasPorPrioridade = [...contasLista].sort((a, b) => {
    const idadeA = idadeCachePorConta.get(a.id as string) ?? Infinity;
    const idadeB = idadeCachePorConta.get(b.id as string) ?? Infinity;
    return idadeB - idadeA; // mais antigo (ou nunca buscado) primeiro
  });

  // Processamento SEQUENCIAL (não Promise.all) para não estourar o rate
  // limit de 5 req/min do Mercado Livre: cada conta com cache expirado
  // aguarda um intervalo antes da próxima ser consultada de verdade. O
  // número de buscas ao vivo é limitado por carregamento para não estourar
  // o timeout de função da Vercel (ver comentário no topo do arquivo).
  const resultadoPorConta = new Map<string, FaturamentoContaResultado>();
  let buscasAoVivo = 0;
  for (const conta of contasPorPrioridade) {
    const contaId = conta.id as string;
    try {
      const accessToken = await getValidAccessToken(contaId);
      const permitirBusca = buscasAoVivo < LIMITE_BUSCAS_AO_VIVO_POR_CARGA;
      const resultado = await getFaturamentoContaCacheado(contaId, accessToken, conta.ml_user_id as number, {
        forcar,
        permitirBusca,
      });
      resultadoPorConta.set(contaId, resultado);
      if (!resultado.deCache) {
        buscasAoVivo++;
        // So espera quando de fato bateu na API E ainda houver orçamento
        // para mais uma busca ao vivo nesta carga -- se acabamos de usar a
        // última permitida, as próximas contas nem vão tentar buscar (só
        // cache/pendente), então esperar aqui só desperdiçaria tempo do
        // orçamento de execução da função.
        if (buscasAoVivo < LIMITE_BUSCAS_AO_VIVO_POR_CARGA) {
          await delay(13000);
        }
      }
    } catch (err) {
      console.error(`Erro ao buscar faturamento de ${conta.nickname}:`, err);
      resultadoPorConta.set(contaId, {
        status: "erro",
        erro: err instanceof Error ? err.message : "Falha ao buscar faturamento desta conta.",
        desatualizado: false,
        atualizadoEm: null,
        deCache: false,
      });
    }
  }

  // Monta os resultados de volta na ordem de exibição original (por nome).
  const resultados: { conta: (typeof contasLista)[number]; nome: string; resultado: FaturamentoContaResultado }[] =
    contasLista.map((conta) => ({
      conta,
      nome: nomeConta(conta),
      resultado: resultadoPorConta.get(conta.id as string) as FaturamentoContaResultado,
    }));

  const contasFaturamento: ContaFaturamento[] = resultados.map((r) => {
    const base = {
      id: r.conta.id as string,
      nome: r.nome,
      cor: (r.conta.cor as string) ?? COR_PADRAO,
      desatualizado: r.resultado.desatualizado,
      atualizadoEmLabel: r.resultado.atualizadoEm ? formatarDataHora(r.resultado.atualizadoEm) : null,
    };

    if (r.resultado.status === "erro") {
      return {
        ...base,
        erro: r.resultado.erro,
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

    if (r.resultado.status === "sem_periodo") {
      return {
        ...base,
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

    const { resumo } = r.resultado;
    return {
      ...base,
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

  const contasComDados = resultados.filter((r) => r.resultado.status === "ok");
  const totalCobrado = contasComDados.reduce(
    (acc, r) => acc + (r.resultado.status === "ok" ? r.resultado.resumo.totalCobrado : 0),
    0
  );
  const totalPago = contasComDados.reduce(
    (acc, r) => acc + (r.resultado.status === "ok" ? r.resultado.resumo.totalPago : 0),
    0
  );
  const totalDivida = contasComDados.reduce(
    (acc, r) => acc + (r.resultado.status === "ok" ? r.resultado.resumo.totalDivida : 0),
    0
  );
  const totalContasComErro = resultados.filter((r) => r.resultado.status === "erro").length;
  const totalContasSemPeriodo = resultados.filter((r) => r.resultado.status === "sem_periodo").length;

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-sixxis-navy)]">Faturamento</h1>
        <Link
          href="/dashboard/faturamento?atualizar=1"
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          Atualizar
        </Link>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Consolidado do período de faturamento mais recente das {contasFaturamento.length} contas
        conectadas ({contasComDados.length} com dados
        {totalContasSemPeriodo > 0 && `, ${totalContasSemPeriodo} sem período disponível`}
        {totalContasComErro > 0 && `, ${totalContasComErro} com falha na consulta`}).
      </p>

      <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-400">
        Dados oficiais de faturamento do Mercado Livre (cobranças da plataforma -- não é o saldo de vendas
        do vendedor). Atualiza sozinho a cada 12h; clique em &quot;Atualizar&quot; para forçar uma consulta nova
        (no máximo {LIMITE_BUSCAS_AO_VIVO_POR_CARGA} contas por clique -- clique mais de uma vez para
        atualizar todas).
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Despesas do período</p>
          <p className="mt-2 text-2xl font-bold text-gray-800 dark:text-gray-100">{formatarMoeda(totalCobrado)}</p>
          <p className="mt-1 text-[11px] text-gray-400">Cobrado pelo Mercado Livre (tarifas, frete, ads)</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Já pago</p>
          <p className="mt-2 text-2xl font-bold text-gray-800 dark:text-gray-100">{formatarMoeda(totalPago)}</p>
          <p className="mt-1 text-[11px] text-gray-400">Pago à Mercado Livre no período</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Saldo em aberto</p>
          <p className="mt-2 text-2xl font-bold text-gray-800 dark:text-gray-100">{formatarMoeda(totalDivida)}</p>
          <p className="mt-1 text-[11px] text-gray-400">Ainda a pagar à Mercado Livre</p>
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
