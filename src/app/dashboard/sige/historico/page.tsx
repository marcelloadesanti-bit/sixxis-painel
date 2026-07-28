import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { variacaoPercentual } from "@/lib/date-utils";

// Historico de Desempenho do SIGE -- equivalente automatizado das abas
// "Dashboard" / "Dashboard Ads" da planilha SIEGE. Populado automaticamente
// a cada Fechamento Mensal concluido (ver sige/fechamento) -- cada linha
// aqui e um snapshot congelado (sige_fechamentos + sige_fechamento_itens),
// nao um recalculo ao vivo.
//
// "vs período anterior" compara com o fechamento IMEDIATAMENTE ANTERIOR na
// lista (ordenada por periodo_de) -- funciona bem quando os fechamentos sao
// feitos mes a mes e em sequencia; se houver um "buraco" entre dois
// fechamentos nao consecutivos, a comparacao ainda e feita mas pode nao ser
// mes-a-mes exato.
export const maxDuration = 30;

function formatarMoeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default async function SigeHistoricoPage() {
  await exigirAcessoSecao("sige", "sige_historico");

  const admin = createAdminClient();
  const { data: fechamentos } = await admin
    .from("sige_fechamentos")
    .select("id, rotulo, periodo_de, periodo_ate, fechado_em")
    .order("periodo_de", { ascending: false });

  const ids = (fechamentos ?? []).map((f) => f.id);
  const { data: itensTodos } = ids.length
    ? await admin
        .from("sige_fechamento_itens")
        .select(
          "fechamento_id, tipo, nome_conta, vendas_brutas, faturamento_bruto, vendas_canceladas, valor_cancelado, vendas_devolvidas, valor_devolvido, vendas_liquidas, faturamento_liquido"
        )
        .in("fechamento_id", ids)
    : { data: [] };

  const itensPorFechamento = new Map<string, typeof itensTodos>();
  for (const item of itensTodos ?? []) {
    const lista = itensPorFechamento.get(item.fechamento_id) ?? [];
    lista.push(item);
    itensPorFechamento.set(item.fechamento_id, lista);
  }

  const linhas = (fechamentos ?? []).map((f) => {
    const itens = itensPorFechamento.get(f.id) ?? [];
    const vendasLiquidas = itens.reduce((s, i) => s + (i.vendas_liquidas ?? 0), 0);
    const faturamentoLiquido = itens.reduce((s, i) => s + Number(i.faturamento_liquido ?? 0), 0);
    return { ...f, itens, vendasLiquidas, faturamentoLiquido };
  });

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">
        SIGE · Histórico de Desempenho
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Fechamentos já realizados, com comparativo em relação ao período anterior. Populado automaticamente sempre
        que um Fechamento Mensal é concluído.
      </p>

      {linhas.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400 dark:border-gray-600">
          Nenhum fechamento realizado ainda.{" "}
          <a href="/dashboard/sige/fechamento" className="underline">
            Fazer o primeiro fechamento
          </a>
          .
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {linhas.map((f, idx) => {
            const anterior = linhas[idx + 1];
            const variacao = anterior ? variacaoPercentual(f.faturamentoLiquido, anterior.faturamentoLiquido) : null;
            return (
              <details key={f.id} className="rounded border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
                <summary className="flex cursor-pointer items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold text-gray-800 dark:text-white">{f.rotulo}</p>
                    <p className="text-xs text-gray-400">
                      {f.periodo_de} a {f.periodo_ate} · fechado em {new Date(f.fechado_em).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-800 dark:text-white">{formatarMoeda(f.faturamentoLiquido)}</p>
                    <p className="text-xs text-gray-400">
                      {f.vendasLiquidas} vendas líquidas
                      {variacao !== null && (
                        <span className={variacao >= 0 ? "ml-2 text-green-600" : "ml-2 text-red-500"}>
                          {variacao >= 0 ? "▲" : "▼"} {Math.abs(variacao).toFixed(1)}% vs anterior
                        </span>
                      )}
                    </p>
                  </div>
                </summary>
                <div className="overflow-x-auto border-t border-gray-100 dark:border-gray-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs uppercase text-gray-500 dark:border-gray-700">
                        <th className="p-3">Conta</th>
                        <th className="p-3 text-right">Vendas brutas</th>
                        <th className="p-3 text-right">Faturamento bruto</th>
                        <th className="p-3 text-right">Cancelados</th>
                        <th className="p-3 text-right">Devolvidos</th>
                        <th className="p-3 text-right">Vendas líquidas</th>
                        <th className="p-3 text-right">Faturamento líquido</th>
                      </tr>
                    </thead>
                    <tbody>
                      {f.itens.map((i, iidx) => (
                        <tr key={iidx} className="border-b border-gray-50 last:border-0 dark:border-gray-700/50">
                          <td className="p-3">{i.nome_conta}</td>
                          <td className="p-3 text-right">{i.vendas_brutas}</td>
                          <td className="p-3 text-right">{formatarMoeda(Number(i.faturamento_bruto))}</td>
                          <td className="p-3 text-right">
                            {i.vendas_canceladas} · {formatarMoeda(Number(i.valor_cancelado))}
                          </td>
                          <td className="p-3 text-right">
                            {i.vendas_devolvidas} · {formatarMoeda(Number(i.valor_devolvido))}
                          </td>
                          <td className="p-3 text-right">{i.vendas_liquidas}</td>
                          <td className="p-3 text-right font-medium">{formatarMoeda(Number(i.faturamento_liquido))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </main>
  );
}
