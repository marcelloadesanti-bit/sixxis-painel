"use client";

import { useState } from "react";
import { criarContainerAction, atualizarContainerAction, excluirContainerAction } from "./actions";
import type { PedidoContainer } from "@/lib/estoque/containers";

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function statusContainer(c: PedidoContainer): { label: string; bg: string; text: string } {
  if (c.dataChegada) {
    return { label: "Chegou", bg: "bg-green-100 dark:bg-green-900/30", text: "text-green-700 dark:text-green-300" };
  }
  if (c.dataEmbarque) {
    return { label: "Em trânsito", bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" };
  }
  return { label: "Aguardando embarque", bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-500 dark:text-gray-400" };
}

export default function ContainersPainel({
  containers,
  podeEditar,
}: {
  containers: PedidoContainer[];
  podeEditar: boolean;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const totalAReceber = containers.filter((c) => !c.dataChegada).reduce((s, c) => s + c.quantidade, 0);
  const naoPagos = containers.filter((c) => !c.pago).length;
  const colunas = podeEditar ? 11 : 10;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Pedidos" valor={containers.length} />
          <Stat label="Unidades a receber" valor={totalAReceber.toLocaleString("pt-BR")} />
          <Stat
            label="Não pagos"
            valor={naoPagos}
            destaque={naoPagos > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
          />
          <Stat label="Chegaram" valor={containers.filter((c) => c.dataChegada).length} />
        </div>
      </div>

      {podeEditar && (
        <div>
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="rounded-lg bg-[var(--color-sixxis-navy)] px-4 py-2 text-sm font-medium text-white"
          >
            {mostrarForm ? "Cancelar" : "+ Novo pedido"}
          </button>
          {mostrarForm && (
            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
              <FormContainer actionDireta={criarContainerAction} aoSalvar={() => setMostrarForm(false)} />
            </div>
          )}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Fatura</th>
              <th className="px-4 py-3">Fornecedor</th>
              <th className="px-4 py-3">SKU</th>
              <th className="px-4 py-3 text-right">Qtd.</th>
              <th className="px-4 py-3">Embarque</th>
              <th className="px-4 py-3">Prev. chegada</th>
              <th className="px-4 py-3">Chegada</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Pagamento</th>
              <th className="px-4 py-3">Observações</th>
              {podeEditar && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {containers.map((c) =>
              editandoId === c.id ? (
                <tr key={c.id}>
                  <td colSpan={colunas} className="px-4 py-3">
                    <FormContainer
                      container={c}
                      actionDireta={atualizarContainerAction}
                      aoSalvar={() => setEditandoId(null)}
                      aoCancelar={() => setEditandoId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.fatura ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.fornecedor}</td>
                  <td className="px-4 py-3 font-mono text-xs font-medium text-gray-900 dark:text-gray-100">
                    {c.sku}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-700 dark:text-gray-300">
                    {c.quantidade.toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatarData(c.dataEmbarque)}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatarData(c.dataPrevChegada)}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{formatarData(c.dataChegada)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge container={c} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        c.pago
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      }`}
                    >
                      {c.pago ? "Pago" : "Não pago"}
                    </span>
                  </td>
                  <td
                    className="max-w-xs truncate px-4 py-3 text-gray-500 dark:text-gray-400"
                    title={c.observacoes ?? ""}
                  >
                    {c.observacoes ?? "—"}
                  </td>
                  {podeEditar && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setEditandoId(c.id)}
                          className="text-xs text-gray-500 hover:text-[var(--color-sixxis-navy)] dark:text-gray-400"
                        >
                          Editar
                        </button>
                        <BotaoExcluir id={c.id} rotulo={c.fatura ?? c.sku} />
                      </div>
                    </td>
                  )}
                </tr>
              )
            )}
          </tbody>
        </table>
        {containers.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhum pedido cadastrado ainda.
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ container }: { container: PedidoContainer }) {
  const s = statusContainer(container);
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${s.bg} ${s.text}`}>{s.label}</span>
  );
}

function BotaoExcluir({ id, rotulo }: { id: string; rotulo: string }) {
  return (
    <form
      action={async (formData: FormData) => {
        if (confirm(`Excluir o pedido "${rotulo}"? Essa ação não pode ser desfeita.`)) {
          await excluirContainerAction(formData);
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs text-red-500 hover:text-red-700">
        Excluir
      </button>
    </form>
  );
}

function Stat({ label, valor, destaque }: { label: string; valor: string | number; destaque?: string }) {
  return (
    <div>
      <div className={`text-2xl font-bold ${destaque ?? "text-[var(--color-sixxis-navy)] dark:text-white"}`}>
        {valor}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}

function FormContainer({
  container,
  actionDireta,
  aoSalvar,
  aoCancelar,
}: {
  container?: PedidoContainer;
  actionDireta: (formData: FormData) => Promise<void>;
  aoSalvar: () => void;
  aoCancelar?: () => void;
}) {
  return (
    <form
      action={async (formData: FormData) => {
        await actionDireta(formData);
        aoSalvar();
      }}
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
    >
      {container && <input type="hidden" name="id" value={container.id} />}
      <Campo label="Fatura" name="fatura" defaultValue={container?.fatura ?? ""} />
      <Campo label="Fornecedor" name="fornecedor" defaultValue={container?.fornecedor ?? ""} required />
      <Campo label="SKU" name="sku" defaultValue={container?.sku ?? ""} required />
      <Campo
        label="Quantidade"
        name="quantidade"
        type="number"
        defaultValue={container ? String(container.quantidade) : ""}
        required
      />
      <Campo label="Embarque" name="dataEmbarque" type="date" defaultValue={container?.dataEmbarque ?? ""} />
      <Campo
        label="Prev. chegada"
        name="dataPrevChegada"
        type="date"
        defaultValue={container?.dataPrevChegada ?? ""}
      />
      <Campo label="Chegada" name="dataChegada" type="date" defaultValue={container?.dataChegada ?? ""} />
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-600 dark:text-gray-300">
        <input type="checkbox" name="pago" defaultChecked={container?.pago ?? false} className="rounded" />
        Pago
      </label>
      <div className="col-span-2 sm:col-span-4">
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Observações</label>
        <input
          type="text"
          name="observacoes"
          defaultValue={container?.observacoes ?? ""}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      <div className="col-span-2 flex items-center gap-3 sm:col-span-4">
        <button
          type="submit"
          className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
        >
          Salvar
        </button>
        {aoCancelar && (
          <button type="button" onClick={aoCancelar} className="text-xs text-gray-400">
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

function Campo({
  label,
  name,
  type = "text",
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">{label}</label>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
      />
    </div>
  );
}
