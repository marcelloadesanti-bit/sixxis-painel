import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { buscarVendasMlAmazon, buscarVendasManuais, type ItemVendas } from "@/lib/sige/vendas";
import { buscarAdsMl, buscarAdsManuais, somarItensAds } from "@/lib/sige/ads";
import { calcularComissao, calcularCanaisAutomaticos, type ConfigComissao } from "@/lib/sige/comissao";
import { buscarComercial } from "@/lib/sige/comercial";
import { enviarAlerta } from "@/lib/alertas/email";

// Recalcula a comissao do mes corrente "ate agora" (do dia 1 ate hoje) e
// grava um snapshot (linha unica, id=1) em sige_comissao_snapshot -- fonte
// rapida para o card de "resumo automatico" da tela de Metas & Comissao, sem
// precisar bater nas APIs do ML/Amazon/Ads a cada carregamento de pagina.
//
// O valor Comercial do mes (lib/sige/comercial.ts -- vendas fechadas
// manualmente pelo setor comercial por dentro do ML) e deduzido da base
// nao-Amazon ANTES de calcular organico/pago, pois essas vendas nao entram
// no comissionamento normal do gestor.
//
// Chamada por duas origens:
// 1) Vercel Cron Job, 1x por dia as 23:30 BRT (ver vercel.json) -- autentica
//    via header Authorization: Bearer <CRON_SECRET>, sem sessao de usuario.
// 2) Botao "Atualizar agora" na propria tela -- autentica via sessao normal,
//    exigindo admin master (mesma regra de Metas & Comissao).
export const maxDuration = 60;

async function autenticar(request: Request): Promise<{ ok: true; disparadoPor: "cron" | "manual"; userId: string | null } | { ok: false }> {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return { ok: true, disparadoPor: "cron", userId: null };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return { ok: false };
  return { ok: true, disparadoPor: "manual", userId: user.id };
}

function formatarDataYMD(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const auth = await autenticar(request);
  if (!auth.ok) {
    return NextResponse.json({ erro: "Nao autorizado." }, { status: 401 });
  }

try {
  const admin = createAdminClient();

  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth() + 1;
  const de = formatarDataYMD(new Date(ano, hoje.getMonth(), 1));
  const ate = formatarDataYMD(hoje);

  const [{ data: configRow }, { data: metaRow }] = await Promise.all([
    admin.from("sige_comissao_config").select("pesos, niveis, recebedores").eq("id", 1).maybeSingle(),
    admin.from("metas_mensais").select("valor").eq("ano", ano).eq("mes", mes).maybeSingle(),
  ]);

  if (!configRow) {
    if (auth.disparadoPor === "cron") {
      await enviarAlerta(
        "Falha no cron de Comissao",
        "Configuracao de comissao (sige_comissao_config) nao encontrada ao rodar o cron diario."
        );
    }
    return NextResponse.json({ erro: "Configuracao de comissao nao encontrada." }, { status: 500 });
  }
  const config = configRow as unknown as ConfigComissao;
  const metaTotal = metaRow ? Number(metaRow.valor) : 0;

  const [vendasAuto, vendasManuais, adsMl, adsManuais, comercial] = await Promise.all([
    buscarVendasMlAmazon(de, ate, null),
    buscarVendasManuais(de, ate, null),
    buscarAdsMl(de, ate, null),
    buscarAdsManuais(de, ate),
    buscarComercial(de, ate),
  ]);

  const itensVendas: ItemVendas[] = [...vendasAuto, ...vendasManuais];
  const baseNaoAmazonBruta = itensVendas
    .filter((i) => i.tipo !== "amazon")
    .reduce((s, i) => s + i.faturamentoLiquido, 0);
  // Deducao do Comercial -- vendas fechadas por dentro do ML pelo setor
  // comercial, fora do fluxo normal de contas, nao entram no comissionamento.
  const baseNaoAmazon = Math.max(0, baseNaoAmazonBruta - comercial.valorTotal);
  const amazonBruto = itensVendas.filter((i) => i.tipo === "amazon").reduce((s, i) => s + i.faturamentoBruto, 0);

  const adsConsolidado = somarItensAds([...adsMl, ...adsManuais]);
  const adsRetorno = adsConsolidado.retorno;

  const { organico, pago } = calcularCanaisAutomaticos({ baseNaoAmazon, amazonBruto, adsRetorno });
  const resultadoBase = calcularComissao({ metaTotal, organico, pago, amazonBruto, config });
  const resultado = {
    ...resultadoBase,
    comercialDeduzido: comercial.valorTotal,
    comercialNumeroVendas: comercial.numeroVendas,
  };

  const calculadoEm = new Date().toISOString();
  const { error } = await admin.from("sige_comissao_snapshot").upsert({
    id: 1,
    ano,
    mes,
    resultado,
    calculado_em: calculadoEm,
    disparado_por: auth.disparadoPor,
    atualizado_por: auth.userId,
  });

  if (error) {
    if (auth.disparadoPor === "cron") {
      await enviarAlerta(
        "Falha no cron de Comissao",
        "Erro ao gravar snapshot de comissao (sige_comissao_snapshot): " + JSON.stringify(error)
        );
    }
    return NextResponse.json({ erro: "Falha ao gravar o snapshot." }, { status: 500 });
  }

  return NextResponse.json({ ano, mes, resultado, calculadoEm, disparadoPor: auth.disparadoPor, periodo: { de, ate } });
} catch (err) {
  console.error("[cron comissao] Erro inesperado:", err);
if (auth.disparadoPor === "cron") {
  await enviarAlerta(
    "Falha no cron de Comissao",
    "Erro inesperado ao calcular comissao: " + (err instanceof Error ? err.message : String(err))
    );
}
return NextResponse.json({ erro: "Erro interno ao calcular comissao." }, { status: 500 });
}
}
