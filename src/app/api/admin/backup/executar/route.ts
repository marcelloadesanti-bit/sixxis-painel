import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarAlerta } from "@/lib/alertas/email";

// Backup manual das tabelas criticas do painel (fonte de verdade, nao
// caches derivados de API). Gera um JSON unico por execucao e salva no
// bucket privado "backups" do Supabase Storage.
//
// Por que backup proprio em vez do backup automatico da Supabase: o plano
// atual (Free) nao inclui point-in-time recovery -- seria necessario
// upgrade para o plano Pro (pago). Ate essa decisao ser tomada, este
// endpoint cobre o risco de perda de dados com um snapshot diario gratuito.
//
// Chamada por duas origens (mesmo padrao do cron de Comissao):
// 1) Vercel Cron Job, 1x por dia -- autentica via CRON_SECRET.
// 2) Botao manual na tela de Configuracoes -- autentica via sessao de admin master.
export const maxDuration = 60;

const TABELAS_CRITICAS = [
  "profiles",
  "ml_accounts",
  "amazon_accounts",
  "metas_mensais",
  "metas_atendimento",
  "metas_ads",
  "canais_manuais",
  "canais_manuais_lancamentos",
  "sige_ads_manuais",
  "sige_fechamentos",
  "sige_fechamento_itens",
  "sige_fechamento_ads_itens",
  "sige_comissao_config",
  "sige_comissao_snapshot",
  "sige_comercial_lancamentos",
  "sige_comissao_historico",
  "estoque_containers",
  "estoque_sku_config",
  "fornecedores",
  ] as const;

const RETENCAO_DIAS = 30;

async function autenticar(request: Request): Promise<{ ok: true; disparadoPor: "cron" | "manual" } | { ok: false }> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true, disparadoPor: "cron" };
  }

const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { ok: false };
  return { ok: true, disparadoPor: "manual" };
}

export async function POST(request: Request) {
  const auth = await autenticar(request);
  if (!auth.ok) {
    return NextResponse.json({ erro: "Nao autorizado." }, { status: 401 });
  }

try {
  const admin = createAdminClient();
  const dump: Record<string, unknown> = {};

  for (const tabela of TABELAS_CRITICAS) {
    const { data, error } = await admin.from(tabela).select("*");
    if (error) {
      throw new Error(`Falha ao ler tabela ${tabela}: ${error.message}`);
    }
    dump[tabela] = data;
  }

  const geradoEm = new Date().toISOString();
  const conteudo = JSON.stringify({ geradoEm, tabelas: dump }, null, 2);
  const nomeArquivo = `backup-${geradoEm.slice(0, 10)}.json`;

  const { error: uploadError } = await admin.storage.from("backups").upload(nomeArquivo, conteudo, {
    contentType: "application/json",
    upsert: true,
  });

  if (uploadError) {
    throw new Error(`Falha ao salvar backup no Storage: ${uploadError.message}`);
  }

  const { data: arquivos } = await admin.storage.from("backups").list("", { limit: 1000 });
  if (arquivos && arquivos.length > RETENCAO_DIAS) {
    const antigos = arquivos
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, arquivos.length - RETENCAO_DIAS)
    .map((f) => f.name);
    if (antigos.length > 0) {
      await admin.storage.from("backups").remove(antigos);
    }
  }

  return NextResponse.json({ ok: true, arquivo: nomeArquivo, tabelas: TABELAS_CRITICAS.length, geradoEm });
} catch (err) {
  console.error("[backup] Erro ao gerar backup:", err);
  await enviarAlerta(
    "Falha no backup diario do painel",
    "Nao foi possivel gerar o backup das tabelas criticas: " + (err instanceof Error ? err.message : String(err))
    );
  return NextResponse.json({ erro: "Falha ao gerar backup." }, { status: 500 });
}
}


// Vercel Cron Jobs chamam a rota via GET (nao POST) -- ver
// https://vercel.com/docs/cron-jobs. Reaproveita a mesma logica do POST
// (usado pelo botao manual) para nao duplicar codigo.
export const GET = POST;
