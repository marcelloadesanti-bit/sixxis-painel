"use client";

import { useState } from "react";
import {
  criarFornecedorAction,
  atualizarFornecedorAction,
  alternarAtivoFornecedorAction,
  excluirFornecedorAction,
} from "./actions";
import { CATEGORIAS_FORNECEDOR, type CategoriaFornecedor, type Fornecedor } from "@/lib/fornecedores";

export default function FornecedoresPainel({
  grupos,
  podeEditar,
}: {
  grupos: Record<CategoriaFornecedor, Fornecedor[]>;
  podeEditar: boolean;
}) {
  return (
    <div className="space-y-8">
      {CATEGORIAS_FORNECEDOR.map((categoria) => (
        <SecaoCategoria key={categoria} categoria={categoria} fornecedores={grupos[categoria]} podeEditar={podeEditar} />
      ))}
    </div>
  );
}

function SecaoCategoria({
  categoria,
  fornecedores,
  podeEditar,
}: {
  categoria: CategoriaFornecedor;
  fornecedores: Fornecedor[];
  podeEditar: boolean;
}) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const ativos = fornecedores.filter((f) => f.ativo).length;
  const colunas = podeEditar ? 6 : 5;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-sixxis-navy)] dark:text-white">{categoria}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {fornecedores.length} cadastrado{fornecedores.length === 1 ? "" : "s"} · {ativos} ativo
            {ativos === 1 ? "" : "s"}
          </p>
        </div>
        {podeEditar && (
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="rounded-lg bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
          >
            {mostrarForm ? "Cancelar" : "+ Novo fornecedor"}
          </button>
        )}
      </div>

      {mostrarForm && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <FormFornecedor
            categoriaPadrao={categoria}
            actionDireta={criarFornecedorAction}
            aoSalvar={() => setMostrarForm(false)}
          />
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-800/50 dark:text-gray-400">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Localização</th>
              <th className="px-4 py-3">CNPJ</th>
              <th className="px-4 py-3">Representante</th>
              <th className="px-4 py-3">Status</th>
              {podeEditar && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {fornecedores.map((f) =>
              editandoId === f.id ? (
                <tr key={f.id}>
                  <td colSpan={colunas} className="px-4 py-3">
                    <FormFornecedor
                      fornecedor={f}
                      categoriaPadrao={categoria}
                      actionDireta={atualizarFornecedorAction}
                      aoSalvar={() => setEditandoId(null)}
                      aoCancelar={() => setEditandoId(null)}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={f.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 dark:text-gray-100">{f.nome}</div>
                    {f.linhaProdutos && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">{f.linhaProdutos}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{f.localizacao ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{f.cnpj ?? "—"}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{f.representanteComercial ?? "—"}</td>
                  <td className="px-4 py-3">
                    <BadgeStatus ativo={f.ativo} />
                  </td>
                  {podeEditar && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setEditandoId(f.id)}
                          className="text-xs text-gray-500 hover:text-[var(--color-sixxis-navy)] dark:text-gray-400"
                        >
                          Editar
                        </button>
                        <BotaoAlternarAtivo id={f.id} ativo={f.ativo} />
                        <BotaoExcluir id={f.id} rotulo={f.nome} />
                      </div>
                    </td>
                  )}
                </tr>
              )
            )}
          </tbody>
        </table>
        {fornecedores.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Nenhum fornecedor cadastrado nesta categoria ainda.
          </div>
        )}
      </div>
    </div>
  );
}

function BadgeStatus({ ativo }: { ativo: boolean }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        ativo
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      }`}
    >
      {ativo ? "Ativo" : "Inativo"}
    </span>
  );
}

function BotaoAlternarAtivo({ id, ativo }: { id: string; ativo: boolean }) {
  return (
    <form action={alternarAtivoFornecedorAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="ativo" value={String(ativo)} />
      <button type="submit" className="text-xs text-gray-500 hover:text-[var(--color-sixxis-navy)] dark:text-gray-400">
        {ativo ? "Desativar" : "Ativar"}
      </button>
    </form>
  );
}

function BotaoExcluir({ id, rotulo }: { id: string; rotulo: string }) {
  return (
    <form
      action={async (formData: FormData) => {
        if (confirm(`Excluir o fornecedor "${rotulo}"? Essa ação não pode ser desfeita.`)) {
          await excluirFornecedorAction(formData);
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

function FormFornecedor({
  fornecedor,
  categoriaPadrao,
  actionDireta,
  aoSalvar,
  aoCancelar,
}: {
  fornecedor?: Fornecedor;
  categoriaPadrao: CategoriaFornecedor;
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
      {fornecedor && <input type="hidden" name="id" value={fornecedor.id} />}
      <div>
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Categoria</label>
        <select
          name="categoria"
          defaultValue={fornecedor?.categoria ?? categoriaPadrao}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          {CATEGORIAS_FORNECEDOR.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <Campo label="Nome" name="nome" defaultValue={fornecedor?.nome ?? ""} required />
      <Campo label="Localização" name="localizacao" defaultValue={fornecedor?.localizacao ?? ""} />
      <Campo label="CNPJ" name="cnpj" defaultValue={fornecedor?.cnpj ?? ""} />
      <Campo
        label="Representante comercial"
        name="representanteComercial"
        defaultValue={fornecedor?.representanteComercial ?? ""}
      />
      <div className="col-span-2 sm:col-span-2">
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Linha de produtos</label>
        <input
          type="text"
          name="linhaProdutos"
          defaultValue={fornecedor?.linhaProdutos ?? ""}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-gray-600 dark:text-gray-300">
        <input type="checkbox" name="ativo" defaultChecked={fornecedor?.ativo ?? true} className="rounded" />
        Ativo
      </label>
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
  defaultValue,
  required,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">{label}</label>
      <input
        type="text"
        name={name}
        defaultValue={defaultValue}
        required={required}
        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
      />
    </div>
  );
}
