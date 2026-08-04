"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import {
  criarFornecedorAction,
  atualizarFornecedorAction,
  alternarAtivoFornecedorAction,
  alternarEstrelaFornecedorAction,
  atualizarLocalizacaoFornecedorAction,
  excluirFornecedorAction,
} from "./actions";
import { CATEGORIAS_FORNECEDOR, type CategoriaFornecedor } from "@/lib/fornecedores-categorias";
import type { Fornecedor } from "@/lib/fornecedores";

// Fase 14 (04/08/2026): a pagina deixou de ser dividida em 3 secoes fixas por
// categoria. Categoria agora e so um campo do cadastro (mostrado como badge
// no card) -- a listagem e uma unica lista de cards expansiveis, ordenada
// por estrela > ativo > nome, para que os melhores fornecedores (estrela)
// apareçam primeiro.
export default function FornecedoresPainel({
  fornecedores,
  podeEditar,
}: {
  fornecedores: Fornecedor[];
  podeEditar: boolean;
}) {
  const [mostrarFormNovo, setMostrarFormNovo] = useState(false);

  const ordenados = [...fornecedores].sort((a, b) => {
    if (a.estrela !== b.estrela) return a.estrela ? -1 : 1;
    if (a.ativo !== b.ativo) return a.ativo ? -1 : 1;
    return a.nome.localeCompare(b.nome, "pt-BR");
  });

  const totalAtivos = fornecedores.filter((f) => f.ativo).length;
  const totalEstrela = fornecedores.filter((f) => f.estrela).length;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {fornecedores.length} cadastrado{fornecedores.length === 1 ? "" : "s"} · {totalAtivos} ativo
          {totalAtivos === 1 ? "" : "s"} · {totalEstrela} estrela{totalEstrela === 1 ? "" : "s"}
        </p>
        {podeEditar && (
          <button
            onClick={() => setMostrarFormNovo((v) => !v)}
            className="shrink-0 rounded-lg bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
          >
            {mostrarFormNovo ? "Cancelar" : "+ Novo fornecedor"}
          </button>
        )}
      </div>

      {mostrarFormNovo && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
          <FormFornecedor actionDireta={criarFornecedorAction} aoSalvar={() => setMostrarFormNovo(false)} />
        </div>
      )}

      {ordenados.length === 0 ? (
        <div className="rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
          Nenhum fornecedor cadastrado ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {ordenados.map((f) => (
            <CardFornecedor key={f.id} fornecedor={f} podeEditar={podeEditar} />
          ))}
        </div>
      )}
    </div>
  );
}

const CORES_CATEGORIA: Record<CategoriaFornecedor, string> = {
  "Ar e ventilação": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  Fitness: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "Aspiradores de pó": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  Samples: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  Outros: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

function BadgeCategoria({ categoria }: { categoria: CategoriaFornecedor }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${CORES_CATEGORIA[categoria] ?? CORES_CATEGORIA.Outros}`}
    >
      {categoria}
    </span>
  );
}

function BadgeStatus({ ativo }: { ativo: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${
        ativo
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300"
          : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
      }`}
    >
      {ativo ? "Ativo" : "Inativo"}
    </span>
  );
}

function BadgeMapa({ geocodificado }: { geocodificado: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
        geocodificado
          ? "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
          : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"
      }`}
    >
      {geocodificado ? "No mapa" : "Sem localização no mapa"}
    </span>
  );
}

function CardFornecedor({ fornecedor, podeEditar }: { fornecedor: Fornecedor; podeEditar: boolean }) {
  const [expandido, setExpandido] = useState(false);
  const [editando, setEditando] = useState(false);
  const geocodificado = fornecedor.latitude != null && fornecedor.longitude != null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800">
      <button
        type="button"
        onClick={() => setExpandido((v) => !v)}
        className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left hover:bg-gray-50 dark:bg-gray-900 dark:hover:bg-gray-800/40"
      >
        <div className="flex min-w-0 items-center gap-3">
          <Star
            size={16}
            className={
              fornecedor.estrela ? "shrink-0 fill-yellow-400 text-yellow-400" : "shrink-0 text-gray-300 dark:text-gray-600"
            }
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium text-gray-900 dark:text-gray-100">{fornecedor.nome}</span>
              <BadgeCategoria categoria={fornecedor.categoria} />
            </div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              {[fornecedor.localizacao, fornecedor.telefone].filter(Boolean).join(" · ") || "Sem localização/telefone cadastrado"}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <BadgeStatus ativo={fornecedor.ativo} />
          <span className="text-gray-400">{expandido ? "▲" : "▼"}</span>
        </div>
      </button>

      {expandido && (
        <div className="border-t border-gray-100 bg-gray-50/60 p-4 dark:border-gray-800 dark:bg-gray-800/20">
          {editando ? (
            <FormFornecedor
              fornecedor={fornecedor}
              actionDireta={atualizarFornecedorAction}
              aoSalvar={() => setEditando(false)}
              aoCancelar={() => setEditando(false)}
            />
          ) : (
            <div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <DetalheCampo label="Telefone" valor={fornecedor.telefone} />
                <DetalheCampo label="CNPJ" valor={fornecedor.cnpj} />
                <DetalheCampo label="Representante comercial" valor={fornecedor.representanteComercial} />
                <DetalheCampo label="Linha de produtos" valor={fornecedor.linhaProdutos} />
              </dl>
              {fornecedor.skus.length > 0 && (
                <div className="mt-3">
                  <dt className="mb-1 text-xs text-gray-500 dark:text-gray-400">SKUs</dt>
                  <div className="flex flex-wrap gap-1.5">
                    {fornecedor.skus.map((sku) => (
                      <span
                        key={sku}
                        className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                      >
                        {sku}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3">
                <BadgeMapa geocodificado={geocodificado} />
              </div>
              {podeEditar && (
                <div className="mt-4 flex flex-wrap items-center gap-4">
                  <button
                    onClick={() => setEditando(true)}
                    className="text-xs font-medium text-[var(--color-sixxis-navy)]"
                  >
                    Editar
                  </button>
                  <BotaoAlternarEstrela id={fornecedor.id} estrela={fornecedor.estrela} />
                  <BotaoAlternarAtivo id={fornecedor.id} ativo={fornecedor.ativo} />
                  {fornecedor.localizacao && <BotaoAtualizarLocalizacao id={fornecedor.id} />}
                  <BotaoExcluir id={fornecedor.id} rotulo={fornecedor.nome} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DetalheCampo({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="text-gray-700 dark:text-gray-200">{valor || "—"}</dd>
    </div>
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

function BotaoAlternarEstrela({ id, estrela }: { id: string; estrela: boolean }) {
  return (
    <form action={alternarEstrelaFornecedorAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="estrela" value={String(estrela)} />
      <button type="submit" className="text-xs text-gray-500 hover:text-[var(--color-sixxis-navy)] dark:text-gray-400">
        {estrela ? "Remover estrela" : "Marcar estrela"}
      </button>
    </form>
  );
}

// Re-geocodifica a localizacao atual sem precisar editar o cadastro -- usada
// tanto para "puxar" para o mapa fornecedores cadastrados antes da
// integracao com o Maps existir, quanto para tentar de novo se a
// geocodificacao falhou da primeira vez.
function BotaoAtualizarLocalizacao({ id }: { id: string }) {
  return (
    <form action={atualizarLocalizacaoFornecedorAction}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs text-gray-500 hover:text-[var(--color-sixxis-navy)] dark:text-gray-400">
        Atualizar localização no mapa
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
  actionDireta,
  aoSalvar,
  aoCancelar,
}: {
  fornecedor?: Fornecedor;
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
          defaultValue={fornecedor?.categoria ?? CATEGORIAS_FORNECEDOR[0]}
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        >
          {CATEGORIAS_FORNECEDOR.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <CampoTexto label="Nome" name="nome" defaultValue={fornecedor?.nome ?? ""} required />
      <CampoTexto label="Telefone" name="telefone" defaultValue={fornecedor?.telefone ?? ""} />
      <CampoTexto
        label="Localização"
        name="localizacao"
        defaultValue={fornecedor?.localizacao ?? ""}
      />
      <CampoTexto label="CNPJ" name="cnpj" defaultValue={fornecedor?.cnpj ?? ""} />
      <CampoTexto
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
      <CampoSkus defaultValue={fornecedor?.skus ?? []} />
      <div className="col-span-2 flex items-center gap-4 self-end pb-2 sm:col-span-2">
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" name="ativo" defaultChecked={fornecedor?.ativo ?? true} className="rounded" />
          Ativo
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input type="checkbox" name="estrela" defaultChecked={fornecedor?.estrela ?? false} className="rounded" />
          Estrela
        </label>
      </div>
      <p className="col-span-2 text-xs text-gray-400 sm:col-span-4">
        A localização é convertida em coordenadas automaticamente para aparecer no mapa (assim que a integração com o
        Google Maps estiver ativa).
      </p>
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

// Campo de SKUs em formato "chip" (tag input). Digitar o SKU e apertar
// espaco ou Enter confirma como chip; colar um texto com varios SKUs
// separados por espaco/virgula quebra tudo de uma vez; Backspace com o
// campo vazio remove o ultimo chip. Cada chip vira um <input type="hidden">
// com name="skus" -- a action le com formData.getAll("skus").
//
// Convencao (Fase 16): cadastrar o SKU "pai", sem sufixo de voltagem (ex:
// CLI-SX040 em vez de CLI-SX040-110 / CLI-SX040-220), para que o match
// futuro com as vendas reais funcione por prefixo e cubra todas as
// variacoes automaticamente.
function CampoSkus({ defaultValue }: { defaultValue: string[] }) {
  const [skus, setSkus] = useState<string[]>(defaultValue);
  const [texto, setTexto] = useState("");

  function adicionar(bruto: string) {
    const partes = bruto
      .split(/[\s,]+/)
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean);
    if (partes.length === 0) return;
    setSkus((atual) => {
      const novo = new Set(atual);
      partes.forEach((p) => novo.add(p));
      return Array.from(novo);
    });
  }

  function remover(sku: string) {
    setSkus((atual) => atual.filter((s) => s !== sku));
  }

  return (
    <div className="col-span-2 sm:col-span-4">
      <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">SKUs</label>
      <div className="flex flex-wrap items-center gap-1.5 rounded border border-gray-300 px-2 py-1.5 dark:border-gray-700 dark:bg-gray-800">
        {skus.map((sku) => (
          <span
            key={sku}
            className="flex items-center gap-1 rounded-full bg-[var(--color-sixxis-navy)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-sixxis-navy)] dark:bg-white/10 dark:text-white"
          >
            {sku}
            <input type="hidden" name="skus" value={sku} />
            <button
              type="button"
              onClick={() => remover(sku)}
              className="text-[var(--color-sixxis-navy)]/60 hover:text-red-500 dark:text-white/60"
            >
              ×
            </button>
          </span>
        ))}
        <input
          type="text"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              adicionar(texto);
              setTexto("");
            } else if (e.key === "Backspace" && texto === "" && skus.length > 0) {
              remover(skus[skus.length - 1]);
            }
          }}
          onBlur={() => {
            if (texto.trim()) {
              adicionar(texto);
              setTexto("");
            }
          }}
          onPaste={(e) => {
            const colado = e.clipboardData.getData("text");
            if (/[\s,]/.test(colado)) {
              e.preventDefault();
              adicionar(colado);
              setTexto("");
            }
          }}
          placeholder={skus.length === 0 ? "Digite o SKU e aperte espaço" : ""}
          className="min-w-[140px] flex-1 border-none bg-transparent text-sm outline-none dark:text-gray-100"
        />
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Espaço ou Enter confirma o SKU. Para produtos com variação de voltagem, cadastre só o SKU "pai" (ex:
        CLI-SX040 em vez de CLI-SX040-110) -- o match com as vendas reais será feito por prefixo.
      </p>
    </div>
  );
}

function CampoTexto({
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
