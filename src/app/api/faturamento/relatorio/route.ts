// 27/07/2026: rota de API dedicada (em vez de server action) para gerar e
// baixar o relatório exportável (XLSX/CSV) do Mercado Livre. Motivo: o fluxo
// de geração faz polling e pode levar bem mais que os ~10s de timeout padrão
// de uma server action na Vercel -- um "use server" file não pode declarar
// `export const maxDuration`, mas uma rota de API (route.ts) pode, igual à
// página de Faturamento (maxDuration=60 no plano Hobby).
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { gerarEBaixarRelatorio, type FormatoRelatorio } from "@/lib/mercadolivre/billing";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";

export const maxDuration = 60;

export async function POST(request: Request) {
  await exigirAcessoSecao("faturamento");

  const { contaId, periodoKeySelecionado, formato } = (await request.json()) as {
    contaId: string;
    periodoKeySelecionado: string | null;
    formato: FormatoRelatorio;
  };

  const admin = createAdminClient();
  const chaveCache = periodoKeySelecionado ?? "ATUAL";
  const { data } = await admin
    .from("faturamento_cache")
    .select("dados")
    .eq("conta_id", contaId)
    .eq("periodo_key", chaveCache)
    .maybeSingle();
  const dados = data?.dados as { periodo?: { key?: string } } | null;
  const chave = dados?.periodo?.key ?? null;

  if (!chave) {
    return NextResponse.json(
      { erro: "Carregue o resumo deste período primeiro (aguarde o card acima terminar de carregar)." },
      { status: 400 }
    );
  }

  try {
    const accessToken = await getValidAccessToken(contaId);
    const resultado = await gerarEBaixarRelatorio(accessToken, chave, formato);
    return NextResponse.json(resultado);
  } catch (err) {
    return NextResponse.json(
      { erro: err instanceof Error ? err.message : "Falha ao gerar relatório desta conta." },
      { status: 500 }
    );
  }
}
