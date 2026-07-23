import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getPedidoDetalhe, getEnvioPedido } from "@/lib/mercadolivre/orders";
import ConfirmButton from "../../confirm-button";
import { enviarMensagemCompradorAction, atualizarStatusEnvioAction } from "../actions";

const formatarMoeda = (valor: number, moeda: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(valor);

const formatarDataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmado",
  payment_required: "Aguardando pagamento",
  payment_in_process: "Pagamento em processamento",
  paid: "Pago",
  shipped: "Enviado",
  delivered: "Entregue",
  not_delivered: "Não entregue",
  cancelled: "Cancelado",
  invalid: "Inválido",
};

export default async function DetalhePedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ conta?: string }>;
}) {
  const { id } = await params;
  const { conta: contaId } = await searchParams;
  const orderId = Number(id);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (!contaId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-red-500">Link inválido: falta o parâmetro da conta.</p>
        <Link href="/dashboard/vendas" className="text-sm text-[var(--color-sixxis-blue)] underline">
          ← Voltar
        </Link>
      </div>
    );
  }

  const { data: conta } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname")
    .eq("id", contaId)
    .maybeSingle();

  let erro: string | null = null;
  let pedido: Awaited<ReturnType<typeof getPedidoDetalhe>> | null = null;
  let envio: Awaited<ReturnType<typeof getEnvioPedido>> = null;

  if (conta) {
    try {
      const accessToken = await getValidAccessToken(contaId);
      [pedido, envio] = await Promise.all([
        getPedidoDetalhe(accessToken, orderId),
        getEnvioPedido(accessToken, orderId),
      ]);
    } catch (err) {
      console.error(`Erro ao buscar pedido ${orderId}:`, err);
      erro = "Não foi possível carregar os detalhes deste pedido agora.";
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/dashboard/vendas" className="text-sm text-[var(--color-sixxis-blue)] underline">
        ← Voltar para Vendas
      </Link>

      <h1 className="mt-2 mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Pedido #{orderId}</h1>
      <p className="mb-6 text-sm text-gray-500">{conta?.nickname ?? "Conta"}</p>

      {erro && <p className="mb-6 rounded bg-red-50 p-3 text-sm text-red-600">{erro}</p>}

      {pedido && (
        <>
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase text-gray-400">Status</p>
              <p className="text-sm font-semibold text-gray-900">
                {STATUS_LABELS[pedido.status] ?? pedido.status}
              </p>
            </div>
            <div className="rounded border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase text-gray-400">Total pago</p>
              <p className="text-sm font-semibold text-gray-900">{formatarMoeda(pedido.totalPago, pedido.moeda)}</p>
            </div>
            <div className="rounded border border-gray-200 bg-white p-4">
              <p className="text-xs uppercase text-gray-400">Data</p>
              <p className="text-sm font-semibold text-gray-900">{formatarDataHora(pedido.dataCriacao)}</p>
            </div>
          </div>

          <h2 className="mb-2 text-sm font-semibold text-gray-700">Itens</h2>
          <ul className="mb-6 divide-y divide-gray-200 rounded border border-gray-200 bg-white">
            {pedido.itens.map((it, i) => (
              <li key={i} className="flex items-center justify-between p-3 text-sm">
                <span className="text-gray-800">{it.titulo}</span>
                <span className="text-gray-500">
                  {it.quantidade} × {formatarMoeda(it.precoUnitario, pedido.moeda)}
                </span>
              </li>
            ))}
          </ul>

          <h2 className="mb-2 text-sm font-semibold text-gray-700">Envio</h2>
          {!envio ? (
            <p className="mb-6 text-sm text-gray-400">Sem informação de envio para este pedido.</p>
          ) : (
            <div className="mb-6 rounded border border-gray-200 bg-white p-4 text-sm">
              <p className="mb-1">
                Status: <span className="font-medium">{STATUS_LABELS[envio.status] ?? envio.status}</span>
                {envio.substatus && <span className="text-gray-400"> ({envio.substatus})</span>}
              </p>
              {envio.trackingNumber && <p className="mb-1 text-gray-500">Rastreio: {envio.trackingNumber}</p>}
              <p className="text-xs text-gray-400">
                Modo: {envio.modo === "me1" ? "Envio autogerenciado (ME1)" : envio.modo.toUpperCase()}
              </p>

              {envio.modo === "me1" && envio.status !== "delivered" && envio.status !== "not_delivered" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <form action={atualizarStatusEnvioAction}>
                    <input type="hidden" name="contaId" value={contaId} />
                    <input type="hidden" name="orderId" value={orderId} />
                    <input type="hidden" name="shipmentId" value={envio.shipmentId} />
                    <input type="hidden" name="status" value="shipped" />
                    <input type="hidden" name="comentario" value="Despachado" />
                    <button className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      Marcar como despachado
                    </button>
                  </form>
                  <form action={atualizarStatusEnvioAction}>
                    <input type="hidden" name="contaId" value={contaId} />
                    <input type="hidden" name="orderId" value={orderId} />
                    <input type="hidden" name="shipmentId" value={envio.shipmentId} />
                    <input type="hidden" name="status" value="delivered" />
                    <input type="hidden" name="comentario" value="Pedido entregue" />
                    <ConfirmButton
                      confirmText="Confirma marcar este pedido como ENTREGUE? Essa ação é irreversível."
                      className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Marcar como entregue
                    </ConfirmButton>
                  </form>
                  <form action={atualizarStatusEnvioAction}>
                    <input type="hidden" name="contaId" value={contaId} />
                    <input type="hidden" name="orderId" value={orderId} />
                    <input type="hidden" name="shipmentId" value={envio.shipmentId} />
                    <input type="hidden" name="status" value="not_delivered" />
                    <input type="hidden" name="substatus" value="returning_to_sender" />
                    <input type="hidden" name="comentario" value="Não entregue" />
                    <ConfirmButton
                      confirmText="Confirma marcar este pedido como NÃO ENTREGUE (retornando ao remetente)? Essa ação é irreversível e inicia o reembolso ao comprador."
                      className="rounded border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Marcar como não entregue
                    </ConfirmButton>
                  </form>
                </div>
              )}
              {envio.modo !== "me1" && (
                <p className="mt-3 text-xs text-gray-400">
                  Envios geridos pelo Mercado Livre (ME2/Full/Flex) são atualizados automaticamente pela
                  transportadora — não é possível alterar o status manualmente por aqui.
                </p>
              )}
            </div>
          )}

          <h2 className="mb-2 text-sm font-semibold text-gray-700">Mensagem ao comprador</h2>
          {pedido.packId && pedido.comprador ? (
            <form action={enviarMensagemCompradorAction} className="flex items-start gap-2">
              <input type="hidden" name="contaId" value={contaId} />
              <input type="hidden" name="orderId" value={orderId} />
              <input type="hidden" name="packId" value={pedido.packId} />
              <input type="hidden" name="buyerId" value={pedido.comprador.id} />
              <input type="hidden" name="mlUserId" value={conta!.ml_user_id} />
              <textarea
                name="mensagem"
                required
                rows={2}
                placeholder={`Escreva uma mensagem para ${pedido.comprador.nickname}...`}
                className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              <button
                type="submit"
                className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
              >
                Enviar
              </button>
            </form>
          ) : (
            <p className="text-xs text-gray-400">Não foi possível identificar a conversa deste pedido.</p>
          )}
        </>
      )}
    </div>
  );
}
