import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarAlerta } from "@/lib/alertas/email";
import { buscarVendasMlAmazon } from "@/lib/sige/vendas";

// Checagem diaria de reconciliacao: confirma que a leitura "ao vivo" de
// vendas (a mesma usada no painel) funciona sem erro para todas as contas
// conectadas. Isso pega o caso em que uma conta para de responder (token
// revogado, API fora do ar, permissao removida) e o painel simplesmente
// mostra zero para aquela conta sem ninguem perceber -- buscarVendasMlAmazon
// ja captura esses erros por conta (campo `erro`), mas ate agora ninguem
// era avisado quando isso acontecia.
//
// Chamada por duas origens (mesmo padrao dos outros crons de hardening):
// 1) Vercel Cron Job, 1x por dia -- autentica via CRON_SECRET.
// 2) Chamada manual -- autentica via sessao de admin master.
export const maxDuration = 60;

function formatarDataYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function autenticar(request: Request): Promise<{ ok: true } | { ok: false }> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true };
  }

const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { ok: false };
  return { ok: true };
}

export async function POST(request: Request) {
  const auth = await autenticar(request);
  if (!auth.ok) {
    return NextResponse.json({ erro: "Nao autorizado." }, { status: 401 });
  }

try {
  const hoje = new Date();
  const seteDiasAtras = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000);
  const de = formatarDataYMD(seteDiasAtras);
  const ate = formatarDataYMD(hoje);

  const itens = await buscarVendasMlAmazon(de, ate, null);
  const comErro = itens.filter((i) => i.erro);

  if (comErro.length > 0) {
    const lista = comErro.map((i) => `- ${i.nome} (${i.tipo}): ${i.erro}`).join("\n");
    await enviarAlerta(
      "Reconciliacao diaria: contas com falha ao ler vendas",
      `${comErro.length} conta(s) nao retornaram dados de vendas nos ultimos 7 dias (o painel provavelmente esta mostrando zero para elas sem avisar ninguem):\n\n${lista}`
      );
  }

  return NextResponse.json({
    ok: true,
    contasChecadas: itens.length,
    contasComErro: comErro.length,
    detalhes: comErro.map((i) => ({ nome: i.nome, tipo: i.tipo, erro: i.erro })),
  });
} catch (err) {
  console.error("[reconciliacao] Erro ao rodar checagem:", err);
  await enviarAlerta(
    "Falha na checagem de reconciliacao diaria",
    "Nao foi possivel rodar a checagem de reconciliacao: " + (err instanceof Error ? err.message : String(err))
    );
  return NextResponse.json({ erro: "Falha ao rodar reconciliacao." }, { status: 500 });
}
}
