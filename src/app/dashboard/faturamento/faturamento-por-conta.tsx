"use client";

import { useState } from "react";
import { buscarNotasFiscais, baixarNotaFiscalPdf } from "./actions";
import type { DocumentoFaturamento } from "@/lib/mercadolivre/billing";

// Layout final (27/07/2026): dados reais da API de Faturamento (Billing) do
// Mercado Livre, com os campos renomeados para termos de negócio. Nota
// importante -- a API de Billing traz as COBRANÇAS que o ML faz da conta
// (tarifas, frete, ads), não o saldo de vendas do vendedor. Por isso os
// termos "Disponível" / "A receber" (que existem no saldo do Mercado Pago)
// não aparecem aqui -- os mais próximos e corretos são "Despesas do
// período", "Já pago" e "Saldo em aberto" (o que ainda falta pagar ao ML).

// 27/07/2026: os encargos agora vem agrupados por categoria (a mesma
// classificação que o painel oficial do Mercado Livre usa -- "Tarifas de
// venda", "Tarifas de envios", etc.), em vez de uma lista solta de códigos
// internos (CVVML, CFONPN...) que ninguém consegue interpretar.
export type ItemFaturamentoFormatado = { label: string; valorLabel: string; temDescricao: boolean; codigo: string };
export type GrupoFaturamentoFormatado = { nome: string; totalLabel: string; itens: ItemFaturamentoFormatado[] };

export type ContaFaturamento = {
  id: string;
  nome: string;
  cor: string;
  erro: string | null;
  semPeriodo: boolean;
  desatualizado: boolean;
  atualizadoEmLabel: string | null;
  periodoLabel: string | null;
  totalCobradoLabel: string | null;
  totalPercepcoesLabel: string | null;
  totalPagoLabel: string | null;
  totalNotaCreditoLabel: string | null;
  totalRecebidoLabel: string | null;
  totalDividaLabel: string | null;
  encargos: GrupoFaturamentoFormatado[];
  bonificacoes: GrupoFaturamentoFormatado[];
};

function Campo({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-gray-800 dark:text-gray-100">{valor ?? "—"}</p>
    </div>
  );
}

function CampoSecundario({ label, valor }: { label: string; valor: string | null }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
      <span>{label}</span>
      <span className="font-medium text-gray-600 dark:text-gray-300">{valor ?? "—"}</span>
    </div>
  );
}

// Mostra os encargos/bonificações agrupados por categoria, igual ao painel
// oficial do Mercado Livre (ex: "Tarifas de venda: R$ X", com os itens que
// compõem esse total logo abaixo). Itens sem descrição amigável da API
// mostram o código interno de forma explícita, em vez de esconder que não
// sabemos do que se trata.
function ListaGrupos({ titulo, grupos }: { titulo: string; grupos: GrupoFaturamentoFormatado[] }) {
  if (grupos.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{titulo}</p>
      <div className="divide-y divide-gray-200 rounded border border-gray-200 bg-white text-sm dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
        {grupos.map((grupo) => (
          <div key={grupo.nome} className="px-3 py-2">
            <div className="flex items-center justify-between font-medium text-gray-800 dark:text-gray-100">
              <span>{grupo.nome}</span>
              <span>{grupo.totalLabel}</span>
            </div>
            {grupo.itens.length > 1 && (
              <ul className="mt-1 space-y-0.5 pl-3">
                {grupo.itens.map((item, i) => (
                  <li key={i} className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>
                      {item.temDescricao ? item.label : `Código ${item.codigo} (Mercado Livre não informa descrição para este item)`}
                    </span>
                    <span>{item.valorLabel}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const TIPO_DOCUMENTO_LABEL: Record<DocumentoFaturamento["tipo"], string> = {
  BILL: "Fatura",
  CREDIT_NOTE: "Nota de crédito",
};

function formatarDataBr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatarMoeda(valor: number, moeda: string): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(valor);
  } catch {
    return `${moeda} ${valor.toFixed(2)}`;
  }
}

// 27/07/2026: notas fiscais sob demanda -- só busca na API do ML quando o
// usuário clica "Ver notas fiscais" (não a cada carregamento de página, pra
// não gastar orçamento extra do rate limit de 5 req/min à toa). O download
// do PDF vem em base64 pela server action e vira um arquivo via Blob no
// navegador.
function NotasFiscais({ contaId, periodoKeySelecionado }: { contaId: string; periodoKeySelecionado: string | null }) {
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [documentos, setDocumentos] = useState<DocumentoFaturamento[] | null>(null);
  const [baixandoId, setBaixandoId] = useState<string | null>(null);

  async function handleAbrir() {
    const novoAberto = !aberto;
    setAberto(novoAberto);
    if (novoAberto && documentos === null && !carregando) {
      setCarregando(true);
      setErro(null);
      const resultado = await buscarNotasFiscais(contaId, periodoKeySelecionado);
      setCarregando(false);
      if ("erro" in resultado) {
        setErro(resultado.erro);
      } else {
        setDocumentos(resultado.documentos);
      }
    }
  }

  async function handleBaixar(fileId: string) {
    setBaixandoId(fileId);
    const resultado = await baixarNotaFiscalPdf(contaId, fileId);
    setBaixandoId(null);
    if ("erro" in resultado) {
      setErro(resultado.erro);
      return;
    }
    const bytes = Uint8Array.from(atob(resultado.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = resultado.nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-3">
      <button
        onClick={handleAbrir}
        className="text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
      >
        {aberto ? "▲" : "▼"} Notas fiscais
      </button>
      {aberto && (
        <div className="mt-1 rounded border border-gray-200 bg-white text-sm dark:border-gray-700 dark:bg-gray-800">
          {carregando && <p className="p-3 text-xs text-gray-400">Carregando...</p>}
          {erro && <p className="p-3 text-xs text-red-500">{erro}</p>}
          {documentos && documentos.length === 0 && (
            <p className="p-3 text-xs text-gray-400">Nenhuma nota fiscal encontrada neste período.</p>
          )}
          {documentos && documentos.length > 0 && (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {documentos.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-gray-600 dark:text-gray-300">
                    {TIPO_DOCUMENTO_LABEL[doc.tipo]} — {formatarDataBr(doc.periodoDataInicio)} a{" "}
                    {formatarDataBr(doc.periodoDataFim)}
                  </span>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-medium text-gray-800 dark:text-gray-100">
                      {formatarMoeda(doc.valor, doc.moeda)}
                    </span>
                    {doc.fileIdPdf ? (
                      <button
                        onClick={() => handleBaixar(doc.fileIdPdf!)}
                        disabled={baixandoId === doc.fileIdPdf}
                        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
                      >
                        {baixandoId === doc.fileIdPdf ? "Baixando..." : "Baixar PDF"}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">PDF indisponível</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {documentos && documentos.length > 0 && (
            <p className="border-t border-gray-200 p-2 text-[11px] text-gray-400 dark:border-gray-700">
              PDF não disponível via API para contas do Brasil (a nota fiscal é emitida por sistema fiscal
              separado do Mercado Livre).
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// 27/07/2026: relatório exportável (XLSX/CSV) do período -- geração sob
// demanda (o Mercado Livre processa de forma assíncrona, por isso o botão
// mostra "Gerando..." enquanto a server action faz o polling do status).
function ExportarRelatorio({ contaId, periodoKeySelecionado }: { contaId: string; periodoKeySelecionado: string | null }) {
  const [gerando, setGerando] = useState<"CSV" | "XLSX" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function handleExportar(formato: "CSV" | "XLSX") {
    setGerando(formato);
    setErro(null);
    try {
      const resp = await fetch("/api/faturamento/relatorio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contaId, periodoKeySelecionado, formato }),
      });
      const resultado = (await resp.json()) as { base64: string; nomeArquivo: string } | { erro: string };
      if (!resp.ok || "erro" in resultado) {
        setErro("erro" in resultado ? resultado.erro : "Falha ao gerar relatório desta conta.");
        return;
      }
      const bytes = Uint8Array.from(atob(resultado.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = resultado.nomeArquivo;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Falha de conexão ao gerar o relatório -- tente novamente.");
    } finally {
      setGerando(null);
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Exportar relatório:</span>
      <button
        onClick={() => handleExportar("CSV")}
        disabled={gerando !== null}
        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        {gerando === "CSV" ? "Gerando..." : "CSV"}
      </button>
      <button
        onClick={() => handleExportar("XLSX")}
        disabled={gerando !== null}
        className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
      >
        {gerando === "XLSX" ? "Gerando..." : "XLSX"}
      </button>
      {erro && <span className="text-xs text-red-500">{erro}</span>}
    </div>
  );
}

function ContaAccordionItem({
  conta,
  defaultOpen,
  periodoKeySelecionado,
}: {
  conta: ContaFaturamento;
  defaultOpen: boolean;
  periodoKeySelecionado: string | null;
}) {
  const [aberto, setAberto] = useState(defaultOpen);

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="h-3 w-3 shrink-0 rounded-full border border-black/10"
            style={{ backgroundColor: conta.cor }}
          />
          <span className="truncate font-semibold text-gray-800 dark:text-gray-100">{conta.nome}</span>
          {conta.periodoLabel && (
            <span className="hidden shrink-0 text-xs text-gray-400 sm:inline">{conta.periodoLabel}</span>
          )}
          {conta.desatualizado && (
            <span className="shrink-0 rounded-full bg-yellow-50 px-2 py-0.5 text-[10px] font-medium text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-500">
              desatualizado
            </span>
          )}
        </div>
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${aberto ? "rotate-180" : ""}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.19l3.71-3.96a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {aberto && (
        <div className="border-t border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/30">
          {conta.atualizadoEmLabel && (
            <p className="mb-2 text-[11px] text-gray-400">
              Atualizado em {conta.atualizadoEmLabel}
              {conta.desatualizado && " (cache antigo -- clique em Atualizar para tentar de novo)"}
            </p>
          )}
          {conta.erro ? (
            <p className={`text-xs ${conta.erro.includes("limite de contas por carregamento") ? "text-gray-500" : "text-red-500"}`}>
              {conta.erro}
            </p>
          ) : conta.semPeriodo ? (
            <p className="text-sm text-gray-400">
              Nenhum período de faturamento disponível ainda para esta conta.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Campo label="Despesas do período" valor={conta.totalCobradoLabel} />
                <Campo label="Já pago" valor={conta.totalPagoLabel} />
                <Campo label="Saldo em aberto" valor={conta.totalDividaLabel} />
              </div>

              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 rounded-lg border border-gray-200 bg-white p-3 sm:grid-cols-3 dark:border-gray-700 dark:bg-gray-800">
                <CampoSecundario label="Percepções tributárias" valor={conta.totalPercepcoesLabel} />
                <CampoSecundario label="Nota de crédito" valor={conta.totalNotaCreditoLabel} />
                <CampoSecundario label="Recebido (consolidado)" valor={conta.totalRecebidoLabel} />
              </div>

              <ListaGrupos titulo="Encargos por categoria" grupos={conta.encargos} />
              <ListaGrupos titulo="Bonificações por categoria" grupos={conta.bonificacoes} />
              <NotasFiscais contaId={conta.id} periodoKeySelecionado={periodoKeySelecionado} />
              <ExportarRelatorio contaId={conta.id} periodoKeySelecionado={periodoKeySelecionado} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function FaturamentoPorConta({
  contas,
  periodoKeySelecionado = null,
}: {
  contas: ContaFaturamento[];
  periodoKeySelecionado?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {contas.map((conta, i) => (
        <ContaAccordionItem
          key={conta.id}
          conta={conta}
          defaultOpen={i === 0}
          periodoKeySelecionado={periodoKeySelecionado}
        />
      ))}
    </div>
  );
}
