import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getTotaisPorStatus, getCanceladosClassificados, periodoDeDatas } from "@/lib/mercadolivre/orders";
import { getValidAccessToken as getValidAccessTokenAmazon } from "@/lib/amazon/token";
import {
  getVendas as getVendasAmazon,
  classificarCancelados,
  periodoDeDatas as periodoDeDatasAmazon,
} from "@/lib/amazon/orders";

// Relatorios do SIGE: agregacao sob demanda por conta (ML, Amazon ou canal
// manual) e periodo livre escolhido pelo usuario -- equivalente automatizado
// e flexivel das abas "Rel. Vendas" etc da planilha SIEGE, mas sem ficar
// preso aos 4 relatorios fixos: aqui o usuario escolhe contas + periodo +
// tipo de metrica.
//
// v1 cobre so o tipo "vendas" (vendas brutas/liquidas/canceladas/devolvidas).
// Visitas e Publicidade/Investimento/Retorno ficam desabilitados no seletor
// (relatorio-client.tsx) ate a proxima iteracao -- reaproveitarao
// lib/mercadolivre/visits.ts e lib/mercadolivre/ads.ts do mesmo jeito.
export const maxDuration = 60;

type ItemRelatorio = {
  id: string;
  tipo: "ml" | "amazon" | "manual";
  nome: string;
  cor: string;
  vendasBrutas: number;
  faturamentoBruto: number;
  vendasCanceladas: number;
  valorCancelado: number;
  vendasDevolvidas: number;
  valorDevolvido: number;
  vendasLiquidas: number;
  faturamentoLiquido: number;
  erro?: string;
};

const ZERADO = {
  vendasBrutas: 0,
  faturamentoBruto: 0,
  vendasCanceladas: 0,
  valorCancelado: 0,
  vendasDevolvidas: 0,
  valorDevolvido: 0,
  vendasLiquidas: 0,
  faturamentoLiquido: 0,
};

export async function GET(request: Request) {
  await exigirAcessoSecao("sige", "sige_relatorios");

  const { searchParams } = new URL(request.url);
  const tipo = searchParams.get("tipo") ?? "vendas";
  const de = searchParams.get("de");
  const ate = searchParams.get("ate");
  const contasParam = searchParams.get("contas");

  if (!de || !ate) {
    return NextResponse.json({ erro: "Periodo (de/ate) obrigatorio." }, { status: 400 });
  }
  if (tipo !== "vendas") {
    return NextResponse.json({ erro: "Este tipo de relatorio ainda nao esta disponivel." }, { status: 400 });
  }

  const admin = createAdminClient();
  const idsFiltro = contasParam ? contasParam.split(",").filter(Boolean) : null;
  const querConta = (prefixo: string, id: string) => !idsFiltro || idsFiltro.includes(`${prefixo}:${id}`);

  const [{ data: contasMl }, { data: contasAmazon }, { data: canais }] = await Promise.all([
    admin.from("ml_accounts").select("id, nickname, apelido, cor, ml_user_id"),
    admin.from("amazon_accounts").select("id, nickname, apelido, cor, marketplace_id"),
    admin.from("canais_manuais").select("id, nome, apelido, cor").eq("ativo", true),
  ]);

  const periodoMl = periodoDeDatas(de, ate);
  const periodoAmazon = periodoDeDatasAmazon(de, ate);
  const itens: ItemRelatorio[] = [];

  await Promise.all([
    ...(contasMl ?? [])
      .filter((c) => querConta("ml", c.id))
      .map(async (c) => {
        try {
          const token = await getValidAccessToken(c.id);
          const [pagas, canceladas, classificacao] = await Promise.all([
            getTotaisPorStatus(token, c.ml_user_id, periodoMl, "paid"),
            getTotaisPorStatus(token, c.ml_user_id, periodoMl, "cancelled"),
            getCanceladosClassificados(token, c.ml_user_id, periodoMl),
          ]);
          itens.push({
            id: `ml:${c.id}`,
            tipo: "ml",
            nome: c.apelido || c.nickname,
            cor: c.cor ?? "#64748b",
            vendasBrutas: pagas.quantidade + canceladas.quantidade,
            faturamentoBruto: pagas.valor + canceladas.valor,
            vendasCanceladas: classificacao.canceladosPuros.quantidade,
            valorCancelado: classificacao.canceladosPuros.valor,
            vendasDevolvidas: classificacao.devolvidos.quantidade,
            valorDevolvido: classificacao.devolvidos.valor,
            vendasLiquidas: pagas.quantidade,
            faturamentoLiquido: pagas.valor,
          });
        } catch (err) {
          itens.push({
            id: `ml:${c.id}`,
            tipo: "ml",
            nome: c.apelido || c.nickname,
            cor: c.cor ?? "#64748b",
            ...ZERADO,
            erro: err instanceof Error ? err.message : "Falha ao buscar dados desta conta.",
          });
        }
      }),
    ...(contasAmazon ?? [])
      .filter((c) => querConta("amazon", c.id))
      .map(async (c) => {
        try {
          const token = await getValidAccessTokenAmazon(c.id);
          const vendas = await getVendasAmazon(
            token,
            c.marketplace_id as string,
            periodoAmazon,
            c.id,
            c.nickname as string
          );
          const cancelados = classificarCancelados(vendas.pedidos);
          itens.push({
            id: `amazon:${c.id}`,
            tipo: "amazon",
            nome: c.apelido || c.nickname,
            cor: c.cor ?? "#64748b",
            vendasBrutas: vendas.totalPedidos,
            faturamentoBruto: vendas.valorSomado,
            vendasCanceladas: cancelados.quantidade,
            valorCancelado: cancelados.valor,
            vendasDevolvidas: 0,
            valorDevolvido: 0,
            vendasLiquidas: vendas.totalPedidos - cancelados.quantidade,
            faturamentoLiquido: vendas.valorSomado - cancelados.valor,
          });
        } catch (err) {
          itens.push({
            id: `amazon:${c.id}`,
            tipo: "amazon",
            nome: c.apelido || c.nickname,
            cor: c.cor ?? "#64748b",
            ...ZERADO,
            erro: err instanceof Error ? err.message : "Falha ao buscar dados desta conta.",
          });
        }
      }),
    ...(canais ?? [])
      .filter((c) => querConta("manual", c.id))
      .map(async (c) => {
        const { data: lancamentos } = await admin
          .from("canais_manuais_lancamentos")
          .select(
            "vendas_brutas, faturamento_bruto, vendas_canceladas, valor_cancelado, vendas_devolvidas, valor_devolvido"
          )
          .eq("canal_id", c.id)
          .lte("periodo_de", ate)
          .gte("periodo_ate", de);

        const soma = (lancamentos ?? []).reduce(
          (acc, l) => ({
            vendasBrutas: acc.vendasBrutas + (l.vendas_brutas ?? 0),
            faturamentoBruto: acc.faturamentoBruto + Number(l.faturamento_bruto ?? 0),
            vendasCanceladas: acc.vendasCanceladas + (l.vendas_canceladas ?? 0),
            valorCancelado: acc.valorCancelado + Number(l.valor_cancelado ?? 0),
            vendasDevolvidas: acc.vendasDevolvidas + (l.vendas_devolvidas ?? 0),
            valorDevolvido: acc.valorDevolvido + Number(l.valor_devolvido ?? 0),
          }),
          { vendasBrutas: 0, faturamentoBruto: 0, vendasCanceladas: 0, valorCancelado: 0, vendasDevolvidas: 0, valorDevolvido: 0 }
        );

        itens.push({
          id: `manual:${c.id}`,
          tipo: "manual",
          nome: c.apelido || c.nome,
          cor: c.cor ?? "#64748b",
          ...soma,
          vendasLiquidas: soma.vendasBrutas - soma.vendasCanceladas - soma.vendasDevolvidas,
          faturamentoLiquido: soma.faturamentoBruto - soma.valorCancelado - soma.valorDevolvido,
        });
      }),
  ]);

  const consolidado = itens.reduce(
    (acc, i) => ({
      vendasBrutas: acc.vendasBrutas + i.vendasBrutas,
      faturamentoBruto: acc.faturamentoBruto + i.faturamentoBruto,
      vendasCanceladas: acc.vendasCanceladas + i.vendasCanceladas,
      valorCancelado: acc.valorCancelado + i.valorCancelado,
      vendasDevolvidas: acc.vendasDevolvidas + i.vendasDevolvidas,
      valorDevolvido: acc.valorDevolvido + i.valorDevolvido,
      vendasLiquidas: acc.vendasLiquidas + i.vendasLiquidas,
      faturamentoLiquido: acc.faturamentoLiquido + i.faturamentoLiquido,
    }),
    { ...ZERADO }
  );

  itens.sort((a, b) => a.nome.localeCompare(b.nome));

  return NextResponse.json({ periodo: { de, ate }, consolidado, itens });
}
