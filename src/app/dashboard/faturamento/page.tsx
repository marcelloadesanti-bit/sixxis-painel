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
// de cada vez (não em paralelo), com um pequeno intervalo entre elas; (3)
// se mesmo assim bater rate limit, mostramos o último dado bom conhecido
// (com aviso de "desatualizado") em vez de erro. O botão "Atualizar" força
// nova consulta ignorando o cache.

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

  // Processamento SEQUENCIAL (não Promise.all) para não estourar o rate
  // limit de 5 req/min do Mercado Livre: cada conta com cache expirado
  // aguarda um intervalo antes da próxima ser consultada de verdade.
  const contasLista = contas ?? [];
  const resultados: { conta: (typeof contasLista)[number]; nome: string; resultado: FaturamentoContaResultado }[] = [];
  for (const conta of contasLista) {
    const nome = nomeConta(conta);
    try {
      const accessToken = await getValidAccessToken(conta.id as string);
      const resultado = await getFaturamentoContaCacheado(conta.id as string, accessToken, conta.ml_user_id as number, {
        forcar,
      });
      resultados.push({ conta, nome, resultado });
      if (!resultado.deCache) {
        // So espera quando de fato bateu na API (evita atraso quando tudo vem do cache).
        await delay(2500);
      }
    } catch (err) {
      console.error(`Erro ao buscar faturamento de ${conta.nickname}:`, err);
      resultados.push({
        conta,
        nome,
        resultado: {
          status: "erro",
          erro: err instanceof Error ? err.message : "Falha ao buscar faturamento desta conta.",
          desatualizado: false,
          atualizadoEm: null,
          deCache: false,
        },
      });
    }
  }

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

      <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-900/10 dark:text-blue-400">
        <span className="font-semibold">Fase de verificação:</span> esta tela já consulta a API real de
        Faturamento do Mercado Livre (com cache de até 12h para não estourar o limite de requisições do
        ML). Os campos abaixo ainda são os nomes originais da API -- a versão final será desenhada depois
        de confirmarmos que os valores batem com o painel do Mercado Livre.
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
