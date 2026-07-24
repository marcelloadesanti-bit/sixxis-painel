import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getTotaisPorStatus, periodoDeDatas } from "@/lib/mercadolivre/orders";
import { getContagemPerguntasNaoRespondidas } from "@/lib/mercadolivre/questions";
import { getMensagensNaoLidas } from "@/lib/mercadolivre/messages";
import { getReclamacoesAbertas } from "@/lib/mercadolivre/claims";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";

// Rota leve para o sino de notificacoes: retorna os contadores atuais POR
// CONTA (perguntas, mensagens, reclamacoes, vendas de hoje), para o cliente
// saber de qual conta veio cada novidade e colorir a notificacao com a cor
// daquela conta. Feita para ser chamada com frequencia (polling).
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: contas } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname, apelido, cor")
    .order("nickname", { ascending: true });

  const hoje = new Date();
  const hojeStr = hoje.toISOString().slice(0, 10);
  const periodoHoje = periodoDeDatas(hojeStr, hojeStr);

  const resultados = await Promise.all(
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
        return {
          contaId: conta.id,
          nickname: nomeConta(conta),
          cor: conta.cor ?? COR_PADRAO,
          perguntas: p,
          mensagens: m.totalMensagens,
          reclamacoes: r.total,
          vendas: vPagas.quantidade + vCanceladas.quantidade,
        };
      } catch (err) {
        console.error(`Erro ao contar notificacoes de ${conta.id}:`, err);
        return {
          contaId: conta.id,
          nickname: nomeConta(conta),
          cor: conta.cor ?? COR_PADRAO,
          perguntas: 0,
          mensagens: 0,
          reclamacoes: 0,
          vendas: 0,
        };
      }
    })
  );

  return NextResponse.json({ contas: resultados, ts: Date.now() });
}
