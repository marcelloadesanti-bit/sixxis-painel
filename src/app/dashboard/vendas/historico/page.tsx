import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getHistoricoPorEstado } from "@/lib/mercadolivre/estado-cache";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";

// Historico de Vendas (30/07/2026) -- le direto do cache permanente
// (pedido_envio_cache), sem NENHUMA chamada a API do Mercado Livre. Por
// isso e instantaneo, mas so mostra o que ja foi "visto" alguma vez pelas
// paginas de Vendas/Metricas (cada visita aumenta a cobertura). Nao tem
// filtro de periodo -- e o acumulado de tudo que ja foi resolvido.
function formatarMes(mes: string): string {
  const [ano, m] = mes.split("-");
  const nomes = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const idx = Number(m) - 1;
  return `${nomes[idx] ?? m} de ${ano}`;
}

export default async function HistoricoVendasPage() {
  await exigirAcessoSecao("vendas");
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { acumulado, porMes, totalPedidosCacheados } = await getHistoricoPorEstado(supabase);

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <div className="mb-6">
        <Link href="/dashboard/vendas" className="text-sm text-[var(--color-sixxis-blue)] underline">
          ← Voltar a Vendas
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Histórico de vendas</h1>
      </div>

      <p className="mb-6 text-xs text-gray-400">
        Acumulado de {totalPedidosCacheados} pedido(s) já mapeados por estado — a cobertura cresce
        automaticamente conforme você usa as páginas de Vendas e Métricas. Sem filtro de período: isto é o
        total de tudo que já foi resolvido até agora.
      </p>

      {totalPedidosCacheados === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          Ainda não há dados no histórico. Visite Vendas ou Métricas para começar a acumular.
        </div>
      ) : (
        <>
          <div className="mb-8">
            <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
              Vendas por estado (acumulado total)
            </h2>
            <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
              <ul className="space-y-1 text-sm">
                {acumulado.map((e) => (
                  <li key={e.estado} className="flex justify-between gap-2">
                    <span className="text-gray-600 dark:text-gray-300">{e.estado}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">{e.quantidade}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Por mês</h2>
            <div className="space-y-4">
              {porMes.map((m) => (
                <details
                  key={m.mes}
                  className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
                >
                  <summary className="cursor-pointer text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {formatarMes(m.mes)} · {m.total} pedido(s)
                  </summary>
                  <ul className="mt-3 space-y-1 text-sm">
                    {m.porEstado.map((e) => (
                      <li key={e.estado} className="flex justify-between gap-2">
                        <span className="text-gray-600 dark:text-gray-300">{e.estado}</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100">{e.quantidade}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </div>
          </div>
        </>
      )}
    </main>
  );
}
