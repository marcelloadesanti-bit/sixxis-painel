"use client";

import { useAoVivo } from "./ao-vivo-context";

const formatarMoeda = (valor: number, moeda: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(valor);

export default function VendasAoVivo() {
  const { dados, carregando, erro } = useAoVivo();
  const v = dados?.vendasHoje;

  return (
    <div className="mb-8 rounded border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
          </span>
          Vendas de hoje ao vivo
        </h2>
        {dados && (
          <span className="text-xs text-gray-400">
            Atualizado às{" "}
            {new Intl.DateTimeFormat("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              timeZone: "America/Sao_Paulo",
            }).format(new Date(dados.ts))}
          </span>
        )}
      </div>

      {erro && !v ? (
        <p className="text-sm text-gray-400">Não foi possível carregar as vendas de hoje agora.</p>
      ) : !v ? (
        <p className="text-sm text-gray-400">Carregando...</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-gray-400">Vendas brutas</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {formatarMoeda(v.vendasBrutas, v.moeda)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Quantidade de vendas</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{v.quantidadeVendas}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Visualizações</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">
              {new Intl.NumberFormat("pt-BR").format(v.visualizacoes)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Conversão</p>
            <p className="text-xl font-bold text-gray-900 dark:text-white">{v.conversao.toFixed(2)}%</p>
          </div>
        </div>
      )}
    </div>
  );
}
