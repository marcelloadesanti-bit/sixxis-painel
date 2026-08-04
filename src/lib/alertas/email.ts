import { Resend } from "resend";

// Envio de alertas por email para falhas silenciosas em processos criticos
// (renovacao de token ML/Amazon, cron de comissao). Best-effort: uma falha
// aqui nunca deve derrubar o fluxo principal que a chamou.

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const DESTINATARIO = process.env.ALERTA_EMAIL_TO || "marcelloa.desanti@gmail.com";
const REMETENTE = process.env.ALERTA_EMAIL_FROM || "onboarding@resend.dev";

export async function enviarAlerta(assunto: string, mensagem: string): Promise<void> {
  if (!resend) {
    console.error("[alerta] RESEND_API_KEY nao configurada. Alerta nao enviado:", assunto);
    return;
  }

try {
  await resend.emails.send({
    from: `Painel Sixxis <${REMETENTE}>`,
    to: DESTINATARIO,
    subject: `[Painel Sixxis] ${assunto}`,
    text: mensagem,
  });
} catch (err) {
  console.error("[alerta] Falha ao enviar email de alerta:", err);
}
}
