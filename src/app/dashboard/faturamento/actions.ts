"use server";

// 27/07/2026: server actions de Faturamento -- notas fiscais (listar +
// baixar PDF). Chamadas sob demanda (o usuário clica "Ver notas fiscais"),
// não a cada carregamento de página, para não gastar orçamento extra do
// rate limit do Mercado Livre (5 req/min) sem necessidade.

import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getDocumentosPeriodo, baixarDocumentoLegal, type DocumentoFaturamento } from "@/lib/mercadolivre/billing";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";

// Nota: o relatório exportável (XLSX/CSV) NÃO usa server action -- o fluxo
// de geração faz polling e pode passar dos ~10s de timeout padrão de uma
// server action na Vercel (arquivos "use server" não podem declarar
// `export const maxDuration`). Por isso ele vira uma rota de API dedicada
// (src/app/api/faturamento/relatorio/route.ts, com maxDuration=60), chamada
// via fetch direto do componente cliente -- ver ExportarRelatorio em
// faturamento-por-conta.tsx.

// Descobre a key real do período (ex: "2026-07-01") a partir do que já está
// em cache -- evita uma chamada extra à API só pra redescobrir "qual é o
// período mais recente" quando já sabemos pelo resumo já carregado na tela.
async function periodoKeyReal(
  admin: ReturnType<typeof createAdminClient>,
  contaId: string,
  periodoKeySelecionado: string | null
): Promise<string | null> {
  const chaveCache = periodoKeySelecionado ?? "ATUAL";
  const { data } = await admin
    .from("faturamento_cache")
    .select("dados")
    .eq("conta_id", contaId)
    .eq("periodo_key", chaveCache)
    .maybeSingle();

  const dados = data?.dados as { periodo?: { key?: string } } | null;
  return dados?.periodo?.key ?? null;
}

export async function buscarNotasFiscais(
  contaId: string,
  periodoKeySelecionado: string | null
): Promise<{ documentos: DocumentoFaturamento[] } | { erro: string }> {
  await exigirAcessoSecao("faturamento");

  const admin = createAdminClient();
  const chave = await periodoKeyReal(admin, contaId, periodoKeySelecionado);
  if (!chave) {
    return { erro: "Carregue o resumo deste período primeiro (aguarde o card acima terminar de carregar)." };
  }

  try {
    const accessToken = await getValidAccessToken(contaId);
    const documentos = await getDocumentosPeriodo(accessToken, chave);
    return { documentos };
  } catch (err) {
    return { erro: err instanceof Error ? err.message : "Falha ao buscar notas fiscais desta conta." };
  }
}

export async function baixarNotaFiscalPdf(
  contaId: string,
  fileId: string
): Promise<{ base64: string; nomeArquivo: string } | { erro: string }> {
  await exigirAcessoSecao("faturamento");

  try {
    const accessToken = await getValidAccessToken(contaId);
    const bytes = await baixarDocumentoLegal(accessToken, fileId);
    const base64 = Buffer.from(bytes).toString("base64");
    return { base64, nomeArquivo: `${fileId}.pdf` };
  } catch (err) {
    return { erro: err instanceof Error ? err.message : "Falha ao baixar a nota fiscal." };
  }
}
