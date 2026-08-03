import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { buscarVendasMlAmazon, buscarVendasManuais } from "@/lib/sige/vendas";
import { buscarAdsMl } from "@/lib/sige/ads";
import { buscarComercial } from "@/lib/sige/comercial";
import { calcularComissao, calcularCanaisAutomaticos, type ConfigComissao } from "@/lib/sige/comissao";

// Fechamento Mensal do SIGE: acao manual e deliberada (o usuario escolhe o
// periodo -- nao precisa ser o mes corrente nem ser feita em uma data
// especifica) que:
// 1) grava os lancamentos manuais informados (canais sem API + Ads sem API)
// para o periodo escolhido, reaproveitaveis depois em Relatorios;
// 2) busca os numeros "ao vivo" de ML + Amazon (vendas) e Mercado Ads (ML)
// para o mesmo periodo, alem do valor Comercial ja lancado (lib/sige/comercial.ts,
// somando o(s) mes(es) calendario tocados pelo periodo);
// 3) congela tudo (sige_fechamentos + sige_fechamento_itens +
// sige_fechamento_ads_itens, essa ultima com as linhas automaticas do
// Mercado Ads por loja E as manuais de Google/Meta Ads) -- e esse
// congelamento que alimenta o Historico de Desempenho e o Relatorio de
// Crescimento (ver lib/sige/historico.ts). O Comercial fica gravado direto
// em sige_fechamentos (comercial_numero_vendas/comercial_valor_total) para
// preservar o valor exato usado naquele momento, mesmo que o lancamento
// mensal seja editado depois.
// 4) 03/08/2026: quando o periodo fechado corresponde a exatamente um mes
// calendario (dia 1 ao ultimo dia do mesmo mes), calcula tambem a comissao
// daquele mes (mesma formula/config usada na calculadora manual de Metas &
// Comissao) e grava em sige_comissao_historico, ligada a este fechamento --
// alimenta a aba "Historico" da tela de Comissao (controle do gestor
// master, congela o valor calculado no momento do fechamento mesmo que a
// config de comissao mude depois). Se nao houver meta configurada para o
// mes, ainda assim grava o historico com metaTotal=0 (mesmo comportamento
// de "sem meta" que a calculadora ja mostra).
export const maxDuration = 60;

export async function GET() {
  await exigirAcessoSecao("sige", "sige_fechamento");

  const admin = createAdminClient();
  const { data: fechamentos, error } = await admin
    .from("sige_fechamentos")
    .select("id, rotulo, periodo_de, periodo_ate, fechado_em, comercial_numero_vendas, comercial_valor_total")
    .order("periodo_de", { ascending: false });

  if (error) {
    return NextResponse.json({ erro: "Falha ao listar fechamentos." }, { status: 500 });
  }

  return NextResponse.json({ fechamentos: fechamentos ?? [] });
}

type CanalManualInput = {
  canalId: string;
  vendasBrutas: number;
  faturamentoBruto: number;
  vendasCanceladas: number;
  valorCancelado: number;
  vendasDevolvidas: number;
  valorDevolvido: number;
};

type AdsManualInput = {
  plataforma: "google_ads" | "meta_ads";
  investimento: number;
  retorno: number;
  vendas: number;
  impressoes: number;
  cliques: number;
};

// Retorna { ano, mes } se o periodo cobre exatamente um mes calendario
// (dia 1 ao ultimo dia do mesmo mes/ano), ou null caso contrario -- mesmo
// criterio ja usado em comissao-client.tsx (sugerirMeta) para decidir se um
// periodo "e" um mes fechado, sem duplicar a logica com datas erradas de
// fuso (compara so a parte YYYY-MM-DD).
function mesCalendarioExato(periodoDe: string, periodoAte: string): { ano: number; mes: number } | null {
  const [anoDe, mesDe, diaDe] = periodoDe.split("-").map(Number);
  const [anoAte, mesAte, diaAte] = periodoAte.split("-").map(Number);
  if (anoDe !== anoAte || mesDe !== mesAte || diaDe !== 1) return null;
  const ultimoDia = new Date(anoDe, mesDe, 0).getDate();
  if (diaAte !== ultimoDia) return null;
  return { ano: anoDe, mes: mesDe };
}

export async function POST(request: Request) {
  const { user, podeEditar } = await exigirAcessoSecao("sige", "sige_fechamento");
  if (!podeEditar) {
    return NextResponse.json({ erro: "Sem permissao para fechar o mes." }, { status: 403 });
  }

  const body = (await request.json()) as {
    periodoDe?: string;
    periodoAte?: string;
    rotulo?: string;
    canaisManuais?: CanalManualInput[];
    adsManuais?: AdsManualInput[];
  };

  const { periodoDe, periodoAte, rotulo } = body;
  if (!periodoDe || !periodoAte || !rotulo) {
    return NextResponse.json({ erro: "Periodo e rotulo sao obrigatorios." }, { status: 400 });
  }
  if (periodoDe > periodoAte) {
    return NextResponse.json({ erro: "O inicio do periodo nao pode ser depois do fim." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existente } = await admin
    .from("sige_fechamentos")
    .select("id")
    .eq("periodo_de", periodoDe)
    .eq("periodo_ate", periodoAte)
    .maybeSingle();
  if (existente) {
    return NextResponse.json(
      { erro: "Ja existe um fechamento gravado para esse periodo exato." },
      { status: 409 }
    );
  }

  // 1) Grava os lancamentos manuais do periodo (reaproveitaveis em Relatorios).
  const canaisManuais = (body.canaisManuais ?? []).filter(
    (c) =>
      c.vendasBrutas || c.faturamentoBruto || c.vendasCanceladas || c.valorCancelado || c.vendasDevolvidas || c.valorDevolvido
  );
  if (canaisManuais.length > 0) {
    await admin.from("canais_manuais_lancamentos").insert(
      canaisManuais.map((c) => ({
        canal_id: c.canalId,
        periodo_de: periodoDe,
        periodo_ate: periodoAte,
        vendas_brutas: c.vendasBrutas,
        faturamento_bruto: c.faturamentoBruto,
        vendas_canceladas: c.vendasCanceladas,
        valor_cancelado: c.valorCancelado,
        vendas_devolvidas: c.vendasDevolvidas,
        valor_devolvido: c.valorDevolvido,
        criado_por: user.id,
      }))
    );
  }

  const adsManuais = (body.adsManuais ?? []).filter((a) => a.investimento || a.retorno || a.vendas || a.impressoes || a.cliques);
  if (adsManuais.length > 0) {
    await admin.from("sige_ads_manuais").insert(
      adsManuais.map((a) => ({
        conta_ml_id: null,
        plataforma: a.plataforma,
        periodo_de: periodoDe,
        periodo_ate: periodoAte,
        investimento: a.investimento,
        retorno: a.retorno,
        vendas: a.vendas,
        impressoes: a.impressoes,
        cliques: a.cliques,
        criado_por: user.id,
      }))
    );
  }

  // 2) Busca os numeros "ao vivo" de ML + Amazon + os manuais recem-gravados
  // (e quaisquer outros ja lancados que se sobreponham ao periodo), o
  // Mercado Ads automatico por loja (para o Historico de Eficiencia de Ads),
  // e o valor Comercial ja lancado para o(s) mes(es) tocados pelo periodo.
  const [itensAuto, itensManuaisTodos, itensAdsAuto, comercial] = await Promise.all([
    buscarVendasMlAmazon(periodoDe, periodoAte, null),
    buscarVendasManuais(periodoDe, periodoAte, null),
    buscarAdsMl(periodoDe, periodoAte, null),
    buscarComercial(periodoDe, periodoAte),
  ]);
  const itens = [...itensAuto, ...itensManuaisTodos];

  // 3) Congela tudo.
  const { data: fechamento, error: erroFechamento } = await admin
    .from("sige_fechamentos")
    .insert({
      rotulo,
      periodo_de: periodoDe,
      periodo_ate: periodoAte,
      fechado_por: user.id,
      comercial_numero_vendas: comercial.numeroVendas,
      comercial_valor_total: comercial.valorTotal,
    })
    .select("id")
    .single();

  if (erroFechamento || !fechamento) {
    return NextResponse.json({ erro: "Falha ao gravar o fechamento." }, { status: 500 });
  }

  await admin.from("sige_fechamento_itens").insert(
    itens.map((i) => ({
      fechamento_id: fechamento.id,
      tipo: i.tipo,
      conta_ref: i.contaRef,
      nome_conta: i.nome,
      vendas_brutas: i.vendasBrutas,
      faturamento_bruto: i.faturamentoBruto,
      vendas_canceladas: i.vendasCanceladas,
      valor_cancelado: i.valorCancelado,
      vendas_devolvidas: i.vendasDevolvidas,
      valor_devolvido: i.valorDevolvido,
      vendas_liquidas: i.vendasLiquidas,
      faturamento_liquido: i.faturamentoLiquido,
    }))
  );

  // Ads: linhas automaticas do Mercado Ads (uma por loja ML, sempre gravadas
  // -- mesmo padrao das vendas, para o Historico ter uma serie completa) +
  // linhas manuais de Google/Meta Ads (so quando ha lancamento no periodo).
  const linhasAdsAuto = itensAdsAuto.map((a) => ({
    fechamento_id: fechamento.id,
    conta_ref: a.contaRef,
    nome_conta: a.nome,
    plataforma: "mercado_ads",
    investimento: a.investimento,
    retorno: a.retorno,
    vendas: a.vendas,
    impressoes: a.impressoes,
    cliques: a.cliques,
  }));
  const linhasAdsManuais = adsManuais.map((a) => ({
    fechamento_id: fechamento.id,
    conta_ref: null,
    nome_conta: a.plataforma === "google_ads" ? "Google Ads" : "Meta Ads",
    plataforma: a.plataforma,
    investimento: a.investimento,
    retorno: a.retorno,
    vendas: a.vendas,
    impressoes: a.impressoes,
    cliques: a.cliques,
  }));
  const linhasAds = [...linhasAdsAuto, ...linhasAdsManuais];
  if (linhasAds.length > 0) {
    await admin.from("sige_fechamento_ads_itens").insert(linhasAds);
  }

  // 4) Se o periodo fechado e exatamente um mes calendario, calcula e grava
  // a comissao daquele mes (Historico de Comissao -- controle do gestor
  // master). Falhas aqui nao devem derrubar o fechamento em si (os dados
  // principais ja foram gravados acima) -- envolve em try/catch e apenas
  // registra no retorno se conseguiu ou nao.
  let comissaoHistorico: { gravado: boolean; motivo?: string } = { gravado: false, motivo: "Periodo nao e um mes calendario exato." };
  const mesExato = mesCalendarioExato(periodoDe, periodoAte);
  if (mesExato) {
    try {
      const [{ data: configRow }, { data: metaRow }] = await Promise.all([
        admin.from("sige_comissao_config").select("pesos, niveis, recebedores").eq("id", 1).maybeSingle(),
        admin.from("metas_mensais").select("valor").eq("ano", mesExato.ano).eq("mes", mesExato.mes).maybeSingle(),
      ]);

      if (!configRow) {
        comissaoHistorico = { gravado: false, motivo: "Configuracao de comissao nao encontrada." };
      } else {
        const config = configRow as unknown as ConfigComissao;
        const metaTotal = metaRow ? Number(metaRow.valor) : 0;

        const baseNaoAmazonBruta = itens
          .filter((i) => i.tipo !== "amazon")
          .reduce((s, i) => s + i.faturamentoLiquido, 0);
        const baseNaoAmazon = Math.max(0, baseNaoAmazonBruta - comercial.valorTotal);
        const amazonBruto = itens.filter((i) => i.tipo === "amazon").reduce((s, i) => s + i.faturamentoBruto, 0);

        const adsRetornoAuto = itensAdsAuto.reduce((s, a) => s + a.retorno, 0);
        const adsRetornoManual = adsManuais.reduce((s, a) => s + a.retorno, 0);
        const adsRetorno = adsRetornoAuto + adsRetornoManual;

        const { organico, pago } = calcularCanaisAutomaticos({ baseNaoAmazon, amazonBruto, adsRetorno });
        const resultado = calcularComissao({ metaTotal, organico, pago, amazonBruto, config });

        const { error: erroHistorico } = await admin.from("sige_comissao_historico").insert({
          fechamento_id: fechamento.id,
          meta_total: metaTotal,
          resultado,
        });
        comissaoHistorico = erroHistorico
          ? { gravado: false, motivo: "Falha ao gravar historico de comissao." }
          : { gravado: true };
      }
    } catch {
      comissaoHistorico = { gravado: false, motivo: "Falha ao calcular comissao do mes." };
    }
  }

  return NextResponse.json({ id: fechamento.id, comercial, comissaoHistorico });
}
