import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import FaturamentoPorConta, { type ContaFaturamento } from "./faturamento-por-conta";

// FASE 1 (estrutura): layout do Faturamento pronto, mas ainda sem dados
// reais. Validamos em 26/07/2026 que a API de Faturamento (Billing) do
// Mercado Livre retorna 404 "recurso nao disponivel" para o app Sixxis --
// testado com 2 contas diferentes (BRASILSIXXIS e SIXXIS), autenticacao
// passa normalmente, entao e liberacao pendente no Developer Center, nao
// erro de token/conta. Assim que a liberacao sair, os cards e o accordion
// abaixo trocam para os valores reais (getSaldoConsolidado / getDespesas
// por conta), sem precisar mudar a estrutura da pagina.
function CardConsolidado({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-gray-300 dark:text-gray-600">—</p>
      {hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
    </div>
  );
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

  const contasFaturamento: ContaFaturamento[] = (contas ?? []).map((c) => ({
    id: c.id as string,
    nome: nomeConta(c),
    cor: (c.cor as string) ?? COR_PADRAO,
  }));

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--color-sixxis-navy)]">Faturamento</h1>
        <button
          disabled
          title="Disponível assim que a API de Faturamento do Mercado Livre for liberada para o app Sixxis"
          className="cursor-not-allowed rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-400 dark:border-gray-700 dark:bg-gray-800"
        >
          Atualizar
        </button>
      </div>
      <p className="mb-4 text-sm text-gray-500">
        Consolidado geral do disponível, a receber, retido e despesas das {contasFaturamento.length} contas
        conectadas.
      </p>

      <div className="mb-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800 dark:border-yellow-900/40 dark:bg-yellow-900/10 dark:text-yellow-400">
        <span className="font-semibold">Aguardando liberação de API:</span> o app Sixxis ainda não tem acesso
        habilitado à API de Faturamento (Billing) do Mercado Livre. O layout abaixo já está pronto e será
        preenchido com dados reais assim que essa liberação sair no Developer Center. Enquanto isso, os dados
        de faturamento continuam disponíveis diretamente no site do Mercado Livre e do Mercado Pago.
      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <CardConsolidado label="Disponível" />
        <CardConsolidado label="A receber" />
        <CardConsolidado label="Retido (reclamações)" />
        <CardConsolidado label="Despesas do período" hint="Tarifas, anúncios e outros descontos do ML" />
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
