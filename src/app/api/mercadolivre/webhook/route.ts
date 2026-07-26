import { NextRequest, NextResponse } from "next/server";

// Endpoint de notificacoes (webhooks) do Mercado Livre.
//
// O painel hoje funciona por polling (ver notification-bell.tsx e a secao
// "Vendas ao vivo"), entao esta rota nao processa o payload -- ela existe
// apenas para responder 200 rapido e confirmar o recebimento. Sem ela, o ML
// ficava tentando entregar notificacoes para uma rota inexistente (visto nos
// logs de producao como uma enxurrada de POST 404 em /api/mercadolivre/webhook,
// a cada poucos segundos). Alem de sujar os logs, o ML pode suspender o envio
// de notificacoes para um app que responde erro repetidamente.
//
// Se no futuro o app passar a reagir a notificacoes em tempo real (em vez de
// polling), processar o payload aqui: { resource, user_id, topic, application_id,
// attempts, sent, received }. Docs:
// https://developers.mercadolivre.com.br/pt_br/produto-notificacoes
export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    console.log("Notificação ML recebida (não processada — app usa polling):", payload?.topic, payload?.resource);
  } catch {
    // corpo vazio ou invalido - ainda assim confirma o recebimento abaixo
  }
  return NextResponse.json({ received: true }, { status: 200 });
}
