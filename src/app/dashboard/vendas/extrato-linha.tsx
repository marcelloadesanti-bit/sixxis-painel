"use client";

import { useState, useTransition } from "react";
import { enviarMensagemCompradorAction } from "./actions";

// Fase 5: linha enriquecida do extrato de pedidos de Vendas -- expande para
// mostrar a quebra financeira (venda bruta - frete - taxa = líquido), status
// de envio/previsão e ações rápidas (mensagem direta, rastreio) sem sair da
// lista. A página de detalhe do pedido (/dashboard/vendas/[id]) continua
// existindo com o conjunto completo de ações (cancelar, editar endereço,
// etiqueta) -- nada foi removido de lá, esta linha só acrescenta um atalho.
export type LinhaExtrato = {
  id: number;
  dataHoraLabel: string;
  contaId: string;
  contaNickname: string;
  mlUserId: number;
  comprador: string;
  compradorId: number | null;
  produto: string;
  vendaBrutaLabel: string;
  freteLabel: string | null;
  taxaLabel: string;
  liquidoLabel: string;
  statusBadge: string | null;
  previsaoLabel: string | null;
  trackingUrl: string | null;
  packId: string;
};

export default function ExtratoLinha({ linha }: { linha: LinhaExtrato }) {
  const [aberto, setAberto] = useState(false);
  const [mensagemAberta, setMensagemAberta] = useState(false);
  const [enviando, startTransition] = useTransition();
  const [enviado, setEnviado] = useState(false);

  return (
    <div className="border-b border-gray-100 last:border-0 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="grid w-full grid-cols-[1fr_auto] items-center gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60"
      >
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {linha.dataHoraLabel} · {linha.contaNickname}
          </p>
          <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">{linha.comprador}</p>
          <p className="truncate text-xs text-gray-500 dark:text-gray-400">{linha.produto}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {linha.statusBadge && (
            <span className="whitespace-nowrap rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300">
              {linha.statusBadge}
              {linha.previsaoLabel ? ` · previsão ${linha.previsaoLabel}` : ""}
            </span>
          )}
          <span className="font-medium text-gray-900 dark:text-gray-100">{linha.vendaBrutaLabel}</span>
        </div>
      </button>

      {aberto && (
        <div className="bg-gray-50 p-4 text-sm dark:bg-gray-900/30">
          <table className="mb-3 w-full max-w-xs">
            <tbody>
              <tr>
                <td className="py-0.5 text-gray-500 dark:text-gray-400">Venda bruta</td>
                <td className="py-0.5 text-right">{linha.vendaBrutaLabel}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-gray-500 dark:text-gray-400">Frete</td>
                <td className="py-0.5 text-right">{linha.freteLabel ?? "—"}</td>
              </tr>
              <tr>
                <td className="py-0.5 text-gray-500 dark:text-gray-400">Taxa da plataforma</td>
                <td className="py-0.5 text-right">{linha.taxaLabel}</td>
              </tr>
              <tr className="font-medium text-gray-900 dark:text-gray-100">
                <td className="py-0.5">Líquido estimado</td>
                <td className="py-0.5 text-right">{linha.liquidoLabel}</td>
              </tr>
            </tbody>
          </table>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMensagemAberta((v) => !v)}
              className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Mensagem
            </button>
            {linha.trackingUrl && (
              <a
                href={linha.trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Rastreio ↗
              </a>
            )}
            <a
              href={`/dashboard/vendas/${linha.id}?conta=${linha.contaId}`}
              className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              Ver pedido completo →
            </a>
          </div>

          {mensagemAberta && linha.compradorId && (
            <form
              action={(fd) => {
                fd.set("contaId", linha.contaId);
                fd.set("packId", linha.packId);
                fd.set("buyerId", String(linha.compradorId));
                fd.set("mlUserId", String(linha.mlUserId));
                fd.set("orderId", String(linha.id));
                startTransition(async () => {
                  await enviarMensagemCompradorAction(fd);
                  setEnviado(true);
                });
              }}
              className="mt-3 flex max-w-md flex-col gap-2"
            >
              <textarea
                name="mensagem"
                rows={2}
                placeholder="Escreva uma mensagem para o comprador"
                required
                className="rounded border border-gray-300 p-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
              />
              <button
                type="submit"
                disabled={enviando}
                className="self-start rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                {enviando ? "Enviando…" : "Enviar"}
              </button>
              {enviado && <p className="text-xs text-green-600">Mensagem enviada.</p>}
            </form>
          )}
          {mensagemAberta && !linha.compradorId && (
            <p className="mt-3 text-xs text-gray-400">
              Não foi possível identificar o comprador deste pedido para mensagem direta.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
