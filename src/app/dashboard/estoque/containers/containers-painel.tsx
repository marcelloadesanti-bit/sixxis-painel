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
// texto livre. Ver CampoFornecedorEItens mais abaixo.
//
// Fase 14b (04/08/2026): um pedido pode trazer mais de um produto no mesmo
// container -- o formulario agora permite adicionar varias linhas de
// SKU + quantidade (ver ItemSkuQuantidade), cada uma virando uma linha
// propria em estoque_containers (ver actions.ts).
//
// nomeExibicaoFornecedor() e uma copia local de lib/fornecedores.ts
// (nomeExibicao) -- este arquivo e "use client", entao nao pode importar
// valores (so tipos) de lib/fornecedores.ts, que depende de next/headers
// via createClient() e quebraria o build no browser.

const OPCAO_MANUAL = "__manual__";

function nomeExibicaoFornecedor(f: Pick<Fornecedor, "nome" | "apelido">): string {
  return f.apelido?.trim() || f.nome;
}

// Data de hoje em formato ISO (AAAA-MM-DD), mesmo formato salvo no banco
// para dataPrevChegada -- usada tanto no filtro de periodo quanto na tag de
// "Atrasado".
function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
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
  if (c.dataPrevChegada && c.dataPrevChegada < hojeISO()) {
    return { label: "Atrasado", bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300" };
  }
  if (c.dataEmbarque) {
    return { label: "Em trânsito", bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300" };
  }
  return { label: "Aguardando embarque", bg: "bg-gray-100 dark:bg-gray-800", text: "text-gray-500 dark:text-gray-400" };
}

// Soma a quantidade de cada SKU dentro de um conjunto de pedidos, do maior
// para o menor -- usado nos cards "Unidades a receber" e no detalhamento por
// mes do card de previsao.
type SkuQuantidade = { sku: string; quantidade: number };

function agruparPorSku(containers: PedidoContainer[]): SkuQuantidade[] {
  const mapa = new Map<string, number>();
  for (const c of containers) {
    mapa.set(c.sku, (mapa.get(c.sku) ?? 0) + c.quantidade);
  }
  return Array.from(mapa.entries())
    .map(([sku, quantidade]) => ({ sku, quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade);
}

// Filtro de periodo: baseado na data de previsao de chegada (mesmo campo
// usado no card de previsao mensal e na tag de atrasado). Sem data de/ate
// definida, todos os pedidos passam. Pedidos sem dataPrevChegada cadastrada
// so ficam de fora quando ha algum filtro ativo (nao tem como avaliar se
// caem no periodo).
function dentroDoPeriodo(c: PedidoContainer, de: string, ate: string): boolean {
  if (!de && !ate) return true;
  if (!c.dataPrevChegada) return false;
  if (de && c.dataPrevChegada < de) return false;
  if (ate && c.dataPrevChegada > ate) return false;
  return true;
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
  const [periodoDe, setPeriodoDe] = useState("");
  const [periodoAte, setPeriodoAte] = useState("");

  const filtroAtivo = periodoDe !== "" || periodoAte !== "";
  const containersFiltrados = containers.filter((c) => dentroDoPeriodo(c, periodoDe, periodoAte));

  const colunas = podeEditar ? 11 : 10;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div>
          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">Previsão de chegada — de</label>
          <input
            type="date"
            value={periodoDe}
            onChange={(e) => setPeriodoDe(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">até</label>
          <input
            type="date"
            value={periodoAte}
            onChange={(e) => setPeriodoAte(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
          />
        </div>
        {filtroAtivo && (
          <button
            type="button"
            onClick={() => {
              setPeriodoDe("");
              setPeriodoAte("");
            }}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          >
            Limpar filtro
          </button>
        )}
        {filtroAtivo && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Mostrando {containersFiltrados.length} de {containers.length} pedidos
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-start">
        <CardStatSimples label="Pedidos" valor={containersFiltrados.length} />
        <CardUnidadesAReceber containers={containersFiltrados} />
        <CardNaoPagos containers={containersFiltrados} />
        <CardStatSimples label="Chegaram" valor={containersFiltrados.filter((c) => c.dataChegada).length} />
      </div>

      <CardPrevisaoMensal containers={containersFiltrados} />

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
            {containersFiltrados.map((c) =>
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
        {containersFiltrados.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {filtroAtivo ? "Nenhum pedido no período selecionado." : "Nenhum pedido cadastrado ainda."}
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

// Card simples de numero + rotulo -- usado para Pedidos e Chegaram, que nao
// precisam de detalhamento adicional.
function CardStatSimples({ label, valor, destaque }: { label: string; valor: string | number; destaque?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className={`text-2xl font-bold ${destaque ?? "text-[var(--color-sixxis-navy)] dark:text-white"}`}>
        {valor}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{label}</div>
    </div>
  );
}

// "Unidades a receber": total de unidades ainda nao chegadas (data_chegada
// nula), com o detalhamento por SKU sempre visivel logo abaixo -- responde
// direto "das 1000 unidades, quantas sao de qual produto".
function CardUnidadesAReceber({ containers }: { containers: PedidoContainer[] }) {
  const pendentes = containers.filter((c) => !c.dataChegada);
  const total = pendentes.reduce((s, c) => s + c.quantidade, 0);
  const porSku = agruparPorSku(pendentes);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div className="text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">
        {total.toLocaleString("pt-BR")}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">Unidades a receber</div>
      {porSku.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 dark:border-gray-800">
          {porSku.map((p) => (
            <div key={p.sku} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-mono text-gray-600 dark:text-gray-300">{p.sku}</span>
              <span className="shrink-0 tabular-nums font-medium text-gray-500 dark:text-gray-400">
                {p.quantidade.toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// "Não pagos": total de pedidos com pagamento pendente, com fatura +
// fornecedor de cada um sempre visivel logo abaixo -- responde direto
// "quais pedidos estao em aberto", sem precisar abrir a tabela.
function CardNaoPagos({ containers }: { containers: PedidoContainer[] }) {
  const naoPagos = containers.filter((c) => !c.pago);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-800 dark:bg-gray-900">
      <div
        className={`text-2xl font-bold ${
          naoPagos.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-[var(--color-sixxis-navy)] dark:text-white"
        }`}
      >
        {naoPagos.length}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">Não pagos</div>
      {naoPagos.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 dark:border-gray-800">
          {naoPagos.map((c) => (
            <div key={c.id} className="truncate text-xs text-gray-600 dark:text-gray-300">
              <span className="font-medium">{c.fatura ?? "Sem fatura"}</span>
              <span className="text-gray-400 dark:text-gray-500"> · {c.fornecedor}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const NOMES_MES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

type PrevisaoMes = { chave: string; rotulo: string; total: number; produtos: SkuQuantidade[] };

// Agrupa os pedidos ainda pendentes (nao chegados) por mes de previsao de
// chegada e, dentro de cada mes, soma a quantidade por SKU -- pedidos
// diferentes do mesmo SKU que chegam no mesmo mes somam num unico item.
// Pedidos pendentes sem data de previsao cadastrada entram num grupo
// separado ("Sem data prevista") em vez de sumirem da contagem.
function calcularPrevisaoMensal(containers: PedidoContainer[]): { meses: PrevisaoMes[]; semPrevisao: SkuQuantidade[] } {
  const pendentes = containers.filter((c) => !c.dataChegada);
  const comData = pendentes.filter((c) => c.dataPrevChegada);
  const semData = pendentes.filter((c) => !c.dataPrevChegada);

  const porMes = new Map<string, PedidoContainer[]>();
  for (const c of comData) {
    const chave = c.dataPrevChegada!.slice(0, 7); // "AAAA-MM"
    const lista = porMes.get(chave) ?? [];
    lista.push(c);
    porMes.set(chave, lista);
  }

  const meses: PrevisaoMes[] = Array.from(porMes.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, lista]) => {
      const [ano, mes] = chave.split("-");
      const produtos = agruparPorSku(lista);
      return {
        chave,
        rotulo: `${NOMES_MES[Number(mes) - 1]} de ${ano}`,
        total: produtos.reduce((s, p) => s + p.quantidade, 0),
        produtos,
      };
    });

  return { meses, semPrevisao: agruparPorSku(semData) };
}

// Previsao de recebimento por mes -- fechado por padrao para nao ocupar
// espaço na tela; abre so quando o usuario clica. Nao renderiza nada se nao
// houver nenhum pedido pendente (nada a prever).
function CardPrevisaoMensal({ containers }: { containers: PedidoContainer[] }) {
  const [aberto, setAberto] = useState(false);
  const { meses, semPrevisao } = calcularPrevisaoMensal(containers);
  const totalGeral = meses.reduce((s, m) => s + m.total, 0) + semPrevisao.reduce((s, p) => s + p.quantidade, 0);

  if (totalGeral === 0) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/40"
      >
        <div>
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">
            Previsão de recebimento por mês
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {meses.length} {meses.length === 1 ? "mês" : "meses"} com previsão de chegada
            {semPrevisao.length > 0
              ? ` · ${semPrevisao.length} SKU${semPrevisao.length === 1 ? "" : "s"} sem data definida`
              : ""}
          </div>
        </div>
        <span className="shrink-0 text-gray-400">{aberto ? "▲" : "▼"}</span>
      </button>

      {aberto && (
        <div className="divide-y divide-gray-100 border-t border-gray-100 dark:divide-gray-800 dark:border-gray-800">
          {meses.map((m) => (
            <div key={m.chave} className="px-4 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{m.rotulo}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {m.total.toLocaleString("pt-BR")} un.
                </span>
              </div>
              <div className="space-y-1">
                {m.produtos.map((p) => (
                  <div key={p.sku} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-mono text-gray-600 dark:text-gray-300">{p.sku}</span>
                    <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                      {p.quantidade.toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {semPrevisao.length > 0 && (
            <div className="px-4 py-3">
              <div className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">Sem data prevista</div>
              <div className="space-y-1">
                {semPrevisao.map((p) => (
                  <div key={p.sku} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate font-mono text-gray-600 dark:text-gray-300">{p.sku}</span>
                    <span className="shrink-0 tabular-nums text-gray-500 dark:text-gray-400">
                      {p.quantidade.toLocaleString("pt-BR")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
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
      <Campo label="Embarque" name="dataEmbarque" type="date" defaultValue={container?.dataEmbarque ?? ""} />
      <Campo
        label="Prev. chegada"
        name="dataPrevChegada"
        type="date"
        defaultValue={container?.dataPrevChegada ?? ""}
      />
      <Campo label="Chegada" name="dataChegada" type="date" defaultValue={container?.dataChegada ?? ""} />

      <CampoFornecedorEItens
        fornecedores={fornecedores}
        fornecedorIdInicial={container?.fornecedorId ?? null}
        fornecedorNomeInicial={container?.fornecedor ?? ""}
        itensIniciais={container ? [{ sku: container.sku, quantidade: container.quantidade }] : []}
      />

      <label className="flex items-center gap-2 self-start pt-1 text-sm text-gray-600 dark:text-gray-300">
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

// Estado de uma linha de item (SKU + quantidade) dentro do formulario. Cada
// linha vira uma linha propria em estoque_containers ao salvar (ver
// actions.ts) -- isso cobre o caso de um pedido/container que chega com
// mais de um produto.
type ItemPedidoForm = {
  id: number;
  manualSku: boolean;
  skuManual: string;
  skuSelecionado: string;
  quantidade: string;
};

function novoItemVazio(): ItemPedidoForm {
  return { id: Math.random(), manualSku: false, skuManual: "", skuSelecionado: "", quantidade: "" };
}

// Fornecedor (select com fallback manual, igual antes) + lista dinamica de
// itens (SKU + quantidade). O usuario pode clicar em "+ Adicionar outro
// SKU" para lancar mais de um produto no mesmo pedido/container -- cada
// linha adicionada exige seu proprio SKU e quantidade. Trocar o fornecedor
// selecionado reinicia a lista de itens (os SKUs cadastrados mudam).
function CampoFornecedorEItens({
  fornecedores,
  fornecedorIdInicial,
  fornecedorNomeInicial,
  itensIniciais,
}: {
  fornecedores: Fornecedor[];
  fornecedorIdInicial: string | null;
  fornecedorNomeInicial: string;
  itensIniciais: { sku: string; quantidade: number }[];
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

  const [itens, setItens] = useState<ItemPedidoForm[]>(() => {
    if (itensIniciais.length === 0) return [novoItemVazio()];
    return itensIniciais.map((item) => {
      const bate = skusDoFornecedor.includes(item.sku);
      return {
        id: Math.random(),
        manualSku: !bate,
        skuManual: item.sku,
        skuSelecionado: bate ? item.sku : "",
        quantidade: item.quantidade ? String(item.quantidade) : "",
      };
    });
  });

  const nomeFinal = manualFornecedor ? nomeManual : fornecedorSelecionado ? nomeExibicaoFornecedor(fornecedorSelecionado) : "";

  function atualizarItem(id: number, patch: Partial<ItemPedidoForm>) {
    setItens((atual) => atual.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  function adicionarItem() {
    setItens((atual) => [...atual, novoItemVazio()]);
  }

  function removerItem(id: number) {
    setItens((atual) => (atual.length > 1 ? atual.filter((it) => it.id !== id) : atual));
  }

  return (
    <div className="col-span-2 space-y-3 sm:col-span-4">
      <div className="max-w-sm">
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
              }
              setItens([novoItemVazio()]);
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
        <label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
          Produtos deste pedido{itens.length > 1 ? ` (${itens.length})` : ""}
        </label>
        <div className="space-y-2">
          {itens.map((item) => (
            <ItemSkuQuantidade
              key={item.id}
              item={item}
              skusDisponiveis={skusDoFornecedor}
              podeRemover={itens.length > 1}
              onAlterar={(patch) => atualizarItem(item.id, patch)}
              onRemover={() => removerItem(item.id)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={adicionarItem}
          className="mt-2 text-xs font-medium text-[var(--color-sixxis-navy)] hover:underline dark:text-sky-400"
        >
          + Adicionar outro SKU
        </button>
      </div>
    </div>
  );
}

// Uma linha do pedido: SKU (select com fallback manual, igual antes) +
// quantidade lado a lado, com botao de remover quando ha mais de uma linha.
function ItemSkuQuantidade({
  item,
  skusDisponiveis,
  podeRemover,
  onAlterar,
  onRemover,
}: {
  item: ItemPedidoForm;
  skusDisponiveis: string[];
  podeRemover: boolean;
  onAlterar: (patch: Partial<ItemPedidoForm>) => void;
  onRemover: () => void;
}) {
  const skuFinal = item.manualSku || skusDisponiveis.length === 0 ? item.skuManual : item.skuSelecionado;

  return (
    <div className="flex items-start gap-2">
      <div className="flex-1">
        {item.manualSku || skusDisponiveis.length === 0 ? (
          <div className="flex gap-1">
            <input
              type="text"
              value={item.skuManual}
              onChange={(e) => onAlterar({ skuManual: e.target.value })}
              required
              placeholder="Digite o SKU"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm font-mono uppercase dark:border-gray-700 dark:bg-gray-800"
            />
            {skusDisponiveis.length > 0 && (
              <button
                type="button"
                onClick={() => onAlterar({ manualSku: false })}
                title="Selecionar da lista de SKUs do fornecedor"
                className="shrink-0 rounded border border-gray-300 px-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400"
              >
                Lista
              </button>
            )}
          </div>
        ) : (
          <select
            value={item.skuSelecionado}
            onChange={(e) => {
              const v = e.target.value;
              if (v === OPCAO_MANUAL) {
                onAlterar({ manualSku: true, skuManual: "" });
              } else {
                onAlterar({ skuSelecionado: v });
              }
            }}
            required
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
          >
            <option value="" disabled>
              Selecione...
            </option>
            {skusDisponiveis.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value={OPCAO_MANUAL}>Outro (digitar manualmente)</option>
          </select>
        )}
        <input type="hidden" name="sku" value={skuFinal} />
      </div>
      <div className="w-28 shrink-0">
        <input
          type="number"
          name="quantidade"
          value={item.quantidade}
          onChange={(e) => onAlterar({ quantidade: e.target.value })}
          required
          placeholder="Qtd."
          className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm dark:border-gray-700 dark:bg-gray-800"
        />
      </div>
      {podeRemover && (
        <button
          type="button"
          onClick={onRemover}
          title="Remover este item"
          className="shrink-0 rounded border border-gray-300 px-2 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:border-gray-700 dark:hover:bg-red-900/20"
        >
          ✕
        </button>
      )}
    </div>
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
