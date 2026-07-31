// Leitura da planilha "ESTOQUE SIXXIS" (Google Sheets) -- SOMENTE LEITURA.
// O painel nunca escreve nesta planilha; o estoque e controlado inteiramente
// pela equipe via a propria planilha (transmissao pos-emissao de nota
// fiscal), o painel apenas le o estado mais recente para gerar metricas e
// projecoes de ruptura.

import { lerIntervaloPlanilha } from "@/lib/google/sheets-auth";

// ID da planilha compartilhada com a conta de servico
// (sixxis-estoque-sheets@sixxis-painel-sheets.iam.gserviceaccount.com) como Visualizador.
const SPREADSHEET_ID = "1ZUunLgT4ggtjLZwJPHEu7cMsIsLel2Ww45ivMiyt90Q";
const ABA_ESTOQUE = "ESTOQUE";

export type ItemEstoque = {
  sku: string;
  categoria: string;
  descricao: string;
  saldoTotal: number;
  saldoLoja: number;
  saldoFull: number;
};

function paraNumero(valor: string | undefined): number {
  if (!valor) return 0;
  const limpo = valor.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = Number(limpo);
  return Number.isFinite(n) ? n : 0;
}

// Le a aba ESTOQUE inteira e mapeia por CABECALHO (nao por posicao de coluna)
// -- resiliente a colunas ocultas/reordenadas na planilha original.
export async function lerEstoquePlanilha(): Promise<ItemEstoque[]> {
  const linhas = await lerIntervaloPlanilha(SPREADSHEET_ID, `${ABA_ESTOQUE}!A1:Z1000`);

  const idxCabecalho = linhas.findIndex((linha) => linha.some((c) => (c ?? "").trim().toUpperCase() === "SKU"));
  if (idxCabecalho === -1) return [];

  const cabecalho = linhas[idxCabecalho].map((c) => (c ?? "").trim().toUpperCase());
  const col = (nome: string) => cabecalho.indexOf(nome);

  const iSku = col("SKU");
  const iCategoria = col("CATEGORIA");
  const iDescricao = col("DESCRIÇÃO");
  const iTotal = col("SALDO TOTAL");
  const iLoja = col("SALDO LOJA");
  const iFull = col("SALDO FULL");

  const itens: ItemEstoque[] = [];
  for (const linha of linhas.slice(idxCabecalho + 1)) {
    const sku = (linha[iSku] ?? "").trim();
    if (!sku) continue;
    itens.push({
      sku,
      categoria: iCategoria >= 0 ? (linha[iCategoria] ?? "").trim() : "",
      descricao: iDescricao >= 0 ? (linha[iDescricao] ?? "").trim() : "",
      saldoTotal: paraNumero(linha[iTotal]),
      saldoLoja: paraNumero(linha[iLoja]),
      saldoFull: paraNumero(linha[iFull]),
    });
  }
  return itens;
}
