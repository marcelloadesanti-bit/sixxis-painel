// Componente de apresentacao (server component, sem interatividade) da
// secao "Metricas" de Vendas -- horario de compra, vendas por estado e mais
// vendidos por SKU. Extraido para ser reaproveitado tanto no Resumo de
// Vendas (/dashboard/vendas, onde continua aparecendo por padrao) quanto na
// subpagina dedicada (/dashboard/vendas/metricas), onde mais coisas serao
// acrescentadas no futuro.

export type PontoHorarioView = { hora: number; quantidade: number };
export type PontoEstadoView = { estado: string; quantidade: number };
export type RankingSkuView = { sku: string; quantidade: number };

export default function MetricasVendasView({
  horario,
  vendasPorEstado,
  estadoAmostraParcial,
  estadoResolvidoTotal,
  estadoTotalPeriodo,
  maisVendidosPorSku,
}: {
  horario: PontoHorarioView[];
  vendasPorEstado: PontoEstadoView[];
  estadoAmostraParcial: boolean;
  estadoResolvidoTotal: number;
  estadoTotalPeriodo: number;
  maisVendidosPorSku: RankingSkuView[];
}) {
  const maxHorario = Math.max(...horario.map((h) => h.quantidade), 1);
  const picoHorario = horario.reduce((max, h) => (h.quantidade > max.quantidade ? h : max), horario[0]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Horário de compra</p>
        <div className="flex items-end gap-0.5" style={{ height: 60 }}>
          {horario.map((h) => (
            <div
              key={h.hora}
              title={`${h.hora}h: ${h.quantidade} pedido(s)`}
              className="flex-1 rounded-t bg-[var(--color-sixxis-navy)]/70"
              style={{ height: `${Math.max((h.quantidade / maxHorario) * 100, 2)}%` }}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          0h a 23h (fuso de Brasília) · pico às {picoHorario?.hora ?? "—"}h
        </p>
      </div>

      <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Vendas por estado</p>
        {vendasPorEstado.length === 0 ? (
          <p className="text-sm text-gray-400">Sem dados suficientes no período.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {vendasPorEstado.map((e) => (
              <li key={e.estado} className="flex justify-between gap-2">
                <span className="truncate text-gray-600 dark:text-gray-300">{e.estado}</span>
                <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">{e.quantidade}</span>
              </li>
            ))}
          </ul>
        )}
        {estadoTotalPeriodo > 0 && (
          <p className="mt-2 text-xs text-gray-400">
            Endereço resolvido para {estadoResolvidoTotal} de {estadoTotalPeriodo} pedidos do período.
          </p>
        )}
        {estadoAmostraParcial && (
          <p className="mt-1 text-xs text-amber-600">
            Os demais serão resolvidos automaticamente nas próximas visitas a esta página.
          </p>
        )}
      </div>

      <div className="rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">Mais vendidos por SKU</p>
        {maisVendidosPorSku.length === 0 ? (
          <p className="text-sm text-gray-400">Sem dados suficientes no período.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {maisVendidosPorSku.slice(0, 8).map((s) => (
              <li key={s.sku} className="flex justify-between gap-2">
                <span className="truncate text-gray-600 dark:text-gray-300">{s.sku}</span>
                <span className="shrink-0 font-medium text-gray-900 dark:text-gray-100">{s.quantidade} un.</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
