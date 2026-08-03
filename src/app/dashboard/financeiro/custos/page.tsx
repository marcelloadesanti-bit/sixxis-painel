import Link from "next/link";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";

// Financeiro > Custos -- 03/08/2026: criada em STANDBY, a pedido do
// usuario, como base para um DRE de e-commerce futuro (margem de impostos
// por conta, custo medio de produto/CMV, custos operacionais). Ainda nao
// tem persistencia nenhuma (sem tabela no Supabase) nem afeta o calculo de
// Margem Bruta -- e so a casca visual, pronta para receber os campos reais
// quando o escopo dessa parte for definido com o usuario. Nenhum input
// aqui e obrigatorio nem salva nada por enquanto.
export default async function CustosPage() {
  await exigirAcessoSecao("faturamento", "fat_custos");

  return (
    <main className="mx-auto min-h-screen max-w-4xl p-6">
      <div className="mb-6">
        <Link href="/dashboard/faturamento" className="text-sm text-[var(--color-sixxis-blue)] underline">
          ← Financeiro
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Custos</h1>
        <p className="mt-1 text-sm text-gray-500">
          Em construção -- vai reunir os custos que faltam para fechar o DRE do e-commerce (a{" "}
          <Link href="/dashboard/financeiro/margem" className="underline">
            Margem Bruta
          </Link>{" "}
          hoje só desconta comissão da plataforma e frete). Nada aqui é obrigatório nem afeta cálculos ainda.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <section className="rounded border border-dashed border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Impostos por conta</p>
          <p className="mb-3 text-xs text-gray-500">
            Alíquota efetiva de imposto (ex: Simples Nacional) aplicada sobre o faturamento de cada conta.
          </p>
          <div className="flex flex-wrap items-end gap-3 opacity-60">
            <label className="flex flex-col text-xs text-gray-500">
              Conta
              <select disabled className="mt-1 w-48 rounded border border-gray-300 px-2 py-1 text-sm">
                <option>Todas as contas</option>
              </select>
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              Alíquota (%)
              <input disabled type="number" placeholder="—" className="mt-1 w-28 rounded border border-gray-300 px-2 py-1 text-sm" />
            </label>
            <button disabled className="rounded bg-gray-300 px-4 py-2 text-sm font-medium text-white">
              Salvar
            </button>
          </div>
        </section>

        <section className="rounded border border-dashed border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Custo médio de produto (CMV)</p>
          <p className="mb-3 text-xs text-gray-500">
            Custo de aquisição/produção por SKU -- vai permitir a Margem Bruta virar margem real do negócio.
          </p>
          <div className="flex flex-wrap items-end gap-3 opacity-60">
            <label className="flex flex-col text-xs text-gray-500">
              SKU
              <input disabled placeholder="—" className="mt-1 w-48 rounded border border-gray-300 px-2 py-1 text-sm" />
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              Custo unitário (R$)
              <input disabled type="number" placeholder="—" className="mt-1 w-32 rounded border border-gray-300 px-2 py-1 text-sm" />
            </label>
            <button disabled className="rounded bg-gray-300 px-4 py-2 text-sm font-medium text-white">
              Salvar
            </button>
          </div>
        </section>

        <section className="rounded border border-dashed border-gray-300 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="mb-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Custos operacionais</p>
          <p className="mb-3 text-xs text-gray-500">
            Despesas fixas/mensais da operação (folha, aluguel, sistemas, etc.) para compor o DRE completo.
          </p>
          <div className="flex flex-wrap items-end gap-3 opacity-60">
            <label className="flex flex-col text-xs text-gray-500">
              Descrição
              <input disabled placeholder="—" className="mt-1 w-48 rounded border border-gray-300 px-2 py-1 text-sm" />
            </label>
            <label className="flex flex-col text-xs text-gray-500">
              Valor mensal (R$)
              <input disabled type="number" placeholder="—" className="mt-1 w-32 rounded border border-gray-300 px-2 py-1 text-sm" />
            </label>
            <button disabled className="rounded bg-gray-300 px-4 py-2 text-sm font-medium text-white">
              Salvar
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
