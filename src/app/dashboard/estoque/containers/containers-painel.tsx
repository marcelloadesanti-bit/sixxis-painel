"use client";

import { useState } from "react";
import { criarContainerAction, atualizarContainerAction, excluirContainerAction } from "./actions";
import type { PedidoContainer } from "@/lib/estoque/containers";
import type { Fornecedor } from "@/lib/fornecedores";

// Fase 14 (04/08/2026): Fornecedor e SKU deixaram de ser texto livre puro --
// agora sao selects populados a partir do cadastro de Fornecedores (ativos),
// com "Outro (digitar manualmente)" como fallback sempre disponivel (pedido
// nunca fica bloqueado por falta de cadastro). Ao escolher um fornecedor
// cadastrado, o SKU tambem vira um select com os SKUs daquele fornecedor;
// se o fornecedor nao tiver SKUs cadastrados, o campo SKU cai direto para
// texto livre. Ver CampoFornecedorSku mais abaixo.
//
// nomeExibicaoFornecedor() e uma copia local de lib/fornecedores.ts
// (nomeExibicao) -- este arquivo e "use client", entao nao pode importar
// valores (so tipos) de lib/fornecedores.ts, que depende de next/headers
// via createClient() e quebraria o build no browser.

const OPCAO_MANUAL = "__manual__";

function nomeExibicaoFornecedor(f: Pick<Fornecedor, "nome" | "apelido">): string {
  return f.apelido?.trim() || f.nome;
}

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
  fornecedores,
}: {
  containers: PedidoContainer[];
  podeEditar: boolean;
  fornecedores: Fornecedor[];
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
              <FormContainer
                actionDireta={criarContainerAction}
                aoSalvar={() => setMostrarForm(false)}
                fornecedores={fornecedores}
              />
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
                      fornecedores={fornecedores}
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
  fornecedores,
}: {
  container?: PedidoContainer;
  actionDireta: (formData: FormData) => Promise<void>;
  aoSalvar: () => void;
  aoCancelar?: () => void;
  fornecedores: Fornecedor[];
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
      <CampoFornecedorSku
        fornecedores={fornecedores}
        fornecedorIdInicial={container?.fornecedorId ?? null}
        fornecedorNomeInicial={container?.fornecedor ?? ""}
        skuInicial={container?.sku ?? ""}
      />
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

// Fornecedor: select com os fornecedores ativos cadastrados (rotulo =
// apelido, com fallback pro nome completo) + opcao "Outro (digitar
// manualmente)" que sempre libera um campo de texto -- garante que o
// lancamento de pedido nunca fique bloqueado por falta de cadastro.
//
// SKU: quando um fornecedor cadastrado esta selecionado E ele tem SKUs
// cadastrados, vira select com os SKUs daquele fornecedor (+ "Outro"). Caso
// contrario (fornecedor sem SKUs cadastrados, ou modo manual de fornecedor),
// cai direto para o campo de texto livre de sempre, sem exigir toggle.
function CampoFornecedorSku({
  fornecedores,
  fornecedorIdInicial,
  fornecedorNomeInicial,
  skuInicial,
}: {
  fornecedores: Fornecedor[];
  fornecedorIdInicial: string | null;
  fornecedorNomeInicial: string;
  skuInicial: string;
}) {
  const fornecedorInicial = fornecedorIdInicial
    ? fornecedores.find((f) => f.id === fornecedorIdInicial) ?? null
    : null;

  // Modo manual quando nao ha fornecedores cadastrados, ou quando o pedido
  // foi lancado com um fornecedor que nao bate com nenhum cadastro ativo
  // atual (fornecedor inativado depois, ou pedido antigo sem fornecedor_id).
  const [manualFornecedor, setManualFornecedor] = useState(
    fornecedores.length === 0 || (fornecedorNomeInicial !== "" && !fornecedorInicial)
  );
  const [fornecedorId, setFornecedorId] = useState(fornecedorInicial?.id ?? "");
  const [nomeManual, setNomeManual] = useState(fornecedorNomeInicial);

  const fornecedorSelecionado = fornecedores.find((f) => f.id === fornecedorId) ?? null;
  const skusDoFornecedor = fornecedorSelecionado?.skus ?? [];
  const skuBateComFornecedor = skusDoFornecedor.includes(skuInicial);

  const [manualSku, setManualSku] = useState(!skuBateComFornecedor);
  const [skuManual, setSkuManual] = useState(skuInicial);
  const [skuSelecionado, setSkuSelecionado] = useState(skuBateComFornecedor ? skuInicial : "");

  const nomeFinal = manualFornecedor ? nomeManual : fornecedorSelecionado ? nomeExibicaoFornecedor(fornecedorSelecionado) : "";
  const skuFinal = manualSku || skusDoFornecedor.length === 0 ? skuManual : skuSelecionado;

  return (
    <>
      <div>
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Fornecedor</label>
        {manualFornecedor ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={nomeManual}
              onChange={(e) => setNomeManual(e.target.value)}
              required
              placeholder="Nome do fornecedor"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
            />
            {fornecedores.length > 0 && (
              <button
                type="button"
                onClick={() => setManualFornecedor(false)}
                title="Selecionar da lista de fornecedores cadastrados"
                className="shrink-0 rounded border border-gray-300 px-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
              >
                Lista
              </button>
            )}
          </div>
        ) : (
          <select
            value={fornecedorId}
            onChange={(e) => {
              const v = e.target.value;
              if (v === OPCAO_MANUAL) {
                setManualFornecedor(true);
                setNomeManual("");
              } else {
                setFornecedorId(v);
                setManualSku(true);
                setSkuSelecionado("");
                setSkuManual("");
              }
            }}
            required
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="" disabled>
              Selecione...
            </option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {nomeExibicaoFornecedor(f)}
              </option>
            ))}
            <option value={OPCAO_MANUAL}>Outro (digitar manualmente)</option>
          </select>
        )}
        <input type="hidden" name="fornecedor" value={nomeFinal} />
        <input type="hidden" name="fornecedorId" value={manualFornecedor ? "" : fornecedorId} />
      </div>

      <div>
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">SKU</label>
        {manualSku || skusDoFornecedor.length === 0 ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={skuManual}
              onChange={(e) => setSkuManual(e.target.value)}
              required
              placeholder="Digite o SKU"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono uppercase dark:border-gray-700 dark:bg-gray-800"
            />
            {skusDoFornecedor.length > 0 && (
              <button
                type="button"
                onClick={() => setManualSku(false)}
                title="Selecionar da lista de SKUs do fornecedor"
                className="shrink-0 rounded border border-gray-300 px-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
              >
                Lista
              </button>
            )}
          </div>
        ) : (
          <select
            value={skuSelecionado}
            onChange={(e) => {
              const v = e.target.value;
              if (v === OPCAO_MANUAL) {
                setManualSku(true);
                setSkuManual("");
              } else {
                setSkuSelecionado(v);
              }
            }}
            required
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="" disabled>
              Selecione...
            </option>
            {skusDoFornecedor.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value={OPCAO_MANUAL}>Outro (digitar manualmente)</option>
          </select>
        )}
        <input type="hidden" name="sku" value={skuFinal} />
      </div>
    </>
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
