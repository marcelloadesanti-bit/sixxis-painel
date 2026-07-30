import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getTotaisPorStatus, periodoDeDatas } from "@/lib/mercadolivre/orders";
import { getMetricasPerguntas } from "@/lib/mercadolivre/questions";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";

// Fase 5: card "Estatística de vendas" (hoje/ontem, semana/semana anterior)
// e o comparativo de Perguntas do card "Estatística da conta", do Resumo.
//
// Por que isso e uma rota separada (chamada via fetch do lado do cliente)
// em vez de entrar direto no carregamento de /dashboard: a pagina do Resumo
// ja faz ~11 chamadas a API do ML POR CONTA so para o periodo selecionado
// (vendas, canceladas, visitas, perguntas atuais, mensagens, series diarias
// x2 -- ver dashboard/page.tsx). Somar mais ~12 chamadas por conta (hoje,
// ontem, semana, semana anterior, perguntas do periodo) no MESMO request
// arriscava estourar o timeout da Vercel (Hobby) com varias contas
// conectadas. Rodando como rota separada, isso tem seu proprio orcamento de
// tempo e nao atrasa o carregamento inicial da pagina.
export const maxDuration = 60;

function formatarData(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function totalPeriodo(accessToken: string, mlUserId: number, de: string, ate: string) {
  const periodo = periodoDeDatas(de, ate);
  const [pagas, canceladas] = await Promise.all([
    getTotaisPorStatus(accessToken, mlUserId, periodo, "paid"),
    getTotaisPorStatus(accessToken, mlUserId, periodo, "cancelled"),
  ]);
  return {
    quantidade: pagas.quantidade + canceladas.quantidade,
    valor: pagas.valor + canceladas.valor,
    canceladas: canceladas.quantidade,
  };
}

type Totais = { quantidade: number; valor: number; canceladas: number };

export async function GET(req: NextRequest) {
  await exigirAcessoSecao("resumo");
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get("contas") ?? "";
  const idsSelecionados = idsParam.split(",").filter(Boolean);

  const supabase = await createClient();
  const { data: contasRaw } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id")
    .order("nickname", { ascending: true });
  const contas = (contasRaw ?? []).filter(
    (c) => idsSelecionados.length === 0 || idsSelecionados.includes(c.id)
  );

  const hoje = new Date();
  const dHoje = formatarData(hoje);
  const dOntem = formatarData(new Date(Date.now() - 86400000));
  const semanaAtual = { de: formatarData(new Date(Date.now() - 6 * 86400000)), ate: dHoje };
  const semanaAnterior = {
    de: formatarData(new Date(Date.now() - 13 * 86400000)),
    ate: formatarData(new Date(Date.now() - 7 * 86400000)),
  };

  const resultados = await Promise.all(
    contas.map(async (conta) => {
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const [hojeR, ontemR, semanaR, semanaAntR, perguntas] = await Promise.all([
          totalPeriodo(accessToken, conta.ml_user_id, dHoje, dHoje),
          totalPeriodo(accessToken, conta.ml_user_id, dOntem, dOntem),
          totalPeriodo(accessToken, conta.ml_user_id, semanaAtual.de, semanaAtual.ate),
          totalPeriodo(accessToken, conta.ml_user_id, semanaAnterior.de, semanaAnterior.ate),
          getMetricasPerguntas(accessToken, conta.ml_user_id, semanaAtual),
        ]);
        return { hojeR, ontemR, semanaR, semanaAntR, perguntas, erro: null as string | null };
      } catch (err) {
        console.error("Erro ao buscar estatisticas extra do Resumo:", err);
        return {
          hojeR: null as Totais | null,
          ontemR: null as Totais | null,
          semanaR: null as Totais | null,
          semanaAntR: null as Totais | null,
          perguntas: null,
          erro: "Falha ao buscar esta conta.",
        };
      }
    })
  );

  function somar(lista: (Totais | null)[], campo: keyof Totais) {
    return lista.reduce((s, r) => s + (r ? r[campo] : 0), 0);
  }

  const hojeTotal = {
    quantidade: somar(resultados.map((r) => r.hojeR), "quantidade"),
    valor: somar(resultados.map((r) => r.hojeR), "valor"),
    canceladas: somar(resultados.map((r) => r.hojeR), "canceladas"),
  };
  const ontemTotal = {
    quantidade: somar(resultados.map((r) => r.ontemR), "quantidade"),
    valor: somar(resultados.map((r) => r.ontemR), "valor"),
    canceladas: somar(resultados.map((r) => r.ontemR), "canceladas"),
  };
  const semanaTotal = {
    quantidade: somar(resultados.map((r) => r.semanaR), "quantidade"),
    valor: somar(resultados.map((r) => r.semanaR), "valor"),
  };
  const semanaAnteriorTotal = {
    quantidade: somar(resultados.map((r) => r.semanaAntR), "quantidade"),
    valor: somar(resultados.map((r) => r.semanaAntR), "valor"),
  };

  const perguntasRecebidas = resultados.reduce((s, r) => s + (r.perguntas?.totalRecebidas ?? 0), 0);
  const perguntasRespondidas = resultados.reduce((s, r) => s + (r.perguntas?.totalRespondidas ?? 0), 0);

  return NextResponse.json({
    hoje: hojeTotal,
    ontem: ontemTotal,
    semana: semanaTotal,
    semanaAnterior: semanaAnteriorTotal,
    perguntas: { recebidas: perguntasRecebidas, respondidas: perguntasRespondidas },
    algumErro: resultados.some((r) => r.erro),
  });
}
