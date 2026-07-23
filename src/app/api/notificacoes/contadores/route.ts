import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getTotaisPorStatus, periodoDeDatas } from "@/lib/mercadolivre/orders";
import { getContagemPerguntasNaoRespondidas } from "@/lib/mercadolivre/questions";
import { getMensagensNaoLidas } from "@/lib/mercadolivre/messages";
import { getReclamacoesAbertas } from "@/lib/mercadolivre/claims";

// Rota leve para o sino de notificacoes: retorna os contadores atuais
// (perguntas, mensagens, reclamacoes, vendas de hoje) consolidados de todas
// as contas. Feita para ser chamada com frequencia (polling) pelo cliente,
// entao evita chamadas pesadas (sem paginar nicknames, etc).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: contas } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id")
    .order("nickname", { ascending: true });

  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);
  const periodoHoje = periodoDeDatas(hojeStr, hojeStr);

  let perguntas = 0;
  let mensagens = 0;
  let reclamacoes = 0;
  let vendas = 0;

  await Promise.all(
    (contas ?? []).map(async (conta) => {
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const [p, m, r, vPagas, vCanceladas] = await Promise.all([
          getContagemPerguntasNaoRespondidas(accessToken, conta.ml_user_id),
          getMensagensNaoLidas(accessToken, conta.id, ""),
          getReclamacoesAbertas(accessToken, conta.ml_user_id, conta.id, ""),
          getTotaisPorStatus(accessToken, conta.ml_user_id, periodoHoje, "paid"),
          getTotaisPorStatus(accessToken, conta.ml_user_id, periodoHoje, "cancelled"),
        ]);
        perguntas += p;
        mensagens += m.totalMensagens;
        reclamacoes += r.total;
        vendas += vPagas.quantidade + vCanceladas.quantidade;
      } catch (err) {
        console.error(`Erro ao contar notificacoes de ${conta.id}:`, err);
      }
    })
  );

  return NextResponse.json({ perguntas, mensagens, reclamacoes, vendas, ts: Date.now() });
}
