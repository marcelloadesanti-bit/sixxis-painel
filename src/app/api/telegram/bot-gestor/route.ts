import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getVendas, periodoDeDatas, type PeriodoISO } from "@/lib/mercadolivre/orders";
import { getTotalVisitas } from "@/lib/mercadolivre/visits";
import { lerEstoquePlanilha } from "@/lib/estoque/planilha";
import { periodoDoPreset } from "@/lib/date-utils";
import {
  sendTelegramMessageComBotoes,
  responderTelegramCallback,
  type BotaoTelegram,
} from "@/lib/telegram";

// Bot Gestor: bot Telegram separado (BOT GESTOR) para responder perguntas
// simples sobre o painel via menu de botoes. v1: apenas o admin master
// (profiles.role = "admin") tem acesso; comandos fixos, sem IA/NLU.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const TOKEN = process.env.TELEGRAM_BOT_GESTOR_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_BOT_GESTOR_WEBHOOK_SECRET;

const MENU: BotaoTelegram[][] = [
  [{ text: "💰 Vendas de hoje", callback_data: "vendas_hoje" }],
  [{ text: "📅 Vendas do mês", callback_data: "vendas_mes" }],
  [{ text: "📆 Vendas do ano", callback_data: "vendas_ano" }],
  [{ text: "🗓️ Vendas em período específico", callback_data: "vendas_periodo" }],
  [{ text: "📦 Vendas de hoje por SKU", callback_data: "vendas_sku" }],
  [{ text: "🏢 Vendas de hoje por conta", callback_data: "vendas_conta" }],
  [{ text: "👀 Visitas de hoje", callback_data: "visitas_hoje" }],
  [{ text: "🚢 Containers do mês", callback_data: "containers_mes" }],
  [{ text: "📋 Estoque de um produto", callback_data: "estoque_sku" }],
];

function moeda(v: number, cod?: string | null): string {
  const prefixo = cod === "USD" ? "US$" : "R$";
  return `${prefixo} ${v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

async function periodoHoje() {
  const { de, ate } = periodoDoPreset("diario", new Date());
  return periodoDeDatas(de, ate);
}

function hojeBRT(): Date {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

function hojeStrBRT(): string {
  return hojeBRT().toISOString().slice(0, 10);
}

function inicioMesBRT(): string {
  const d = hojeBRT();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
}

function inicioAnoBRT(): string {
  const d = hojeBRT();
  return new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
}

// Converte "DD/MM/AAAA" digitado pelo usuario em "AAAA-MM-DD", validando a
// data real (rejeita "31/02/2026", por exemplo).
function parseDataBR(texto: string): string | null {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    d.getUTCFullYear() !== ano ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia
  ) {
    return null;
  }
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

function formatarDataBR(isoDate: string): string {
  const [ano, mes, dia] = isoDate.split("-");
  return `${dia}/${mes}/${ano}`;
}

async function contasAtivas() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("ml_accounts")
    .select("id, nickname, apelido, ml_user_id");
  return data ?? [];
}

async function ehAdminMaster(chatId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id")
    .eq("telegram_chat_id", chatId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

async function respostaVendasResumo(
  periodo: PeriodoISO,
  titulo: string
): Promise<string> {
  const contas = await contasAtivas();
  let totalPedidos = 0;
  let valorSomado = 0;
  let cod: string | null = null;
  for (const conta of contas) {
    try {
      const token = await getValidAccessToken(conta.id);
      const r = await getVendas(
        token,
        conta.ml_user_id,
        periodo,
        conta.id,
        conta.apelido || conta.nickname || ""
      );
      totalPedidos += r.totalPedidos;
      valorSomado += r.valorSomado;
      cod = cod || r.moeda;
    } catch {
      // conta com token invalido ou erro pontual: ignora e segue com as demais
    }
  }
  return `<b>${titulo}</b>\n\nPedidos: <b>${totalPedidos}</b>\nFaturamento: <b>${moeda(
    valorSomado,
    cod
  )}</b>`;
}

async function respostaVendasHoje(): Promise<string> {
  return respostaVendasResumo(await periodoHoje(), "💰 Vendas de hoje");
}

async function respostaVendasMes(): Promise<string> {
  return respostaVendasResumo(
    periodoDeDatas(inicioMesBRT(), hojeStrBRT()),
    "📅 Vendas do mês"
  );
}

async function respostaVendasAno(): Promise<string> {
  return respostaVendasResumo(
    periodoDeDatas(inicioAnoBRT(), hojeStrBRT()),
    "📆 Vendas do ano"
  );
}

async function respostaVendasPorSku(): Promise<string> {
  const contas = await contasAtivas();
  const periodo = await periodoHoje();
  const porProduto = new Map<
    string,
    { titulo: string; quantidade: number; valor: number }
  >();
  for (const conta of contas) {
    try {
      const token = await getValidAccessToken(conta.id);
      const r = await getVendas(
        token,
        conta.ml_user_id,
        periodo,
        conta.id,
        conta.apelido || conta.nickname || ""
      );
      for (const p of r.porProduto) {
        const atual = porProduto.get(p.itemId) ?? {
          titulo: p.titulo,
          quantidade: 0,
          valor: 0,
        };
        atual.quantidade += p.quantidade;
        atual.valor += p.valor;
        porProduto.set(p.itemId, atual);
      }
    } catch {
      // segue com as demais contas
    }
  }
  const lista = Array.from(porProduto.values())
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 10);
  if (lista.length === 0) {
    return "<b>📦 Vendas de hoje por produto</b>\n\nNenhuma venda ainda hoje.";
  }
  const linhas = lista
    .map((p) => `• ${p.titulo} — ${p.quantidade}x (${moeda(p.valor)})`)
    .join("\n");
  return `<b>📦 Vendas de hoje por produto</b>\n\n${linhas}`;
}

async function respostaVendasPorConta(): Promise<string> {
  const contas = await contasAtivas();
  const periodo = await periodoHoje();
  const linhas: string[] = [];
  for (const conta of contas) {
    const nome = conta.apelido || conta.nickname || conta.id;
    try {
      const token = await getValidAccessToken(conta.id);
      const r = await getVendas(token, conta.ml_user_id, periodo, conta.id, nome);
      linhas.push(
        `• <b>${nome}</b>: ${r.totalPedidos} pedidos — ${moeda(
          r.valorSomado,
          r.moeda
        )}`
      );
    } catch {
      linhas.push(`• <b>${nome}</b>: erro ao consultar`);
    }
  }
  return `<b>🏢 Vendas de hoje por conta</b>\n\n${linhas.join("\n")}`;
}

async function respostaVisitasHoje(): Promise<string> {
  const contas = await contasAtivas();
  const { de, ate } = periodoDoPreset("diario", new Date());
  let total = 0;
  for (const conta of contas) {
    try {
      const token = await getValidAccessToken(conta.id);
      total += await getTotalVisitas(token, conta.ml_user_id, de, ate);
    } catch {
      // segue com as demais contas
    }
  }
  return `<b>👀 Visitas de hoje</b>\n\nTotal de visitas: <b>${total}</b>`;
}

async function respostaContainersMes(): Promise<string> {
  const admin = createAdminClient();
  const d = hojeBRT();
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth();
  const inicio = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);
  const fim = new Date(Date.UTC(ano, mes + 1, 0)).toISOString().slice(0, 10);

  const { data } = await admin
    .from("estoque_containers")
    .select("sku, quantidade, data_chegada")
    .gte("data_prev_chegada", inicio)
    .lte("data_prev_chegada", fim);

  const containers = data ?? [];
  if (containers.length === 0) {
    return `<b>🚢 Containers previstos para este mês</b>\n\nNenhum container previsto.`;
  }
  const chegaram = containers.filter((c) => c.data_chegada).length;
  const pendentes = containers.length - chegaram;
  const porSku = new Map<string, number>();
  for (const c of containers) {
    porSku.set(c.sku, (porSku.get(c.sku) ?? 0) + (c.quantidade ?? 0));
  }
  const linhasSku = Array.from(porSku.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([sku, qtd]) => `• ${sku}: ${qtd} un.`)
    .join("\n");
  return `<b>🚢 Containers previstos para este mês</b>\n\nPedidos: ${
    containers.length
  } (✅ ${chegaram} chegaram, ⏳ ${pendentes} pendentes)\n\nPor SKU:\n${linhasSku}`;
}

async function respostaEstoqueSku(consulta: string): Promise<string> {
  const itens = await lerEstoquePlanilha();
  const q = consulta.trim().toLowerCase();
  const encontrados = itens
    .filter(
      (i) =>
        i.sku.toLowerCase().includes(q) || i.descricao.toLowerCase().includes(q)
    )
    .slice(0, 5);
  if (encontrados.length === 0) {
    return `Nenhum produto encontrado para "${consulta}".`;
  }
  const linhas = encontrados
    .map(
      (i) =>
        `• <b>${i.sku}</b> — ${i.descricao}\n  Total: ${i.saldoTotal} | Loja: ${i.saldoLoja} | Full: ${i.saldoFull}`
    )
    .join("\n\n");
  return `<b>📋 Estoque</b>\n\n${linhas}`;
}

async function definirEstado(
  chatId: string,
  aguardando: string | null,
  dado?: string | null
) {
  const admin = createAdminClient();
  await admin.from("telegram_bot_estado").upsert({
    chat_id: chatId,
    aguardando,
    dado: dado ?? null,
    atualizado_em: new Date().toISOString(),
  });
}

async function lerEstado(
  chatId: string
): Promise<{ aguardando: string | null; dado: string | null }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("telegram_bot_estado")
    .select("aguardando, dado")
    .eq("chat_id", chatId)
    .maybeSingle();
  return { aguardando: data?.aguardando ?? null, dado: data?.dado ?? null };
}

export async function POST(req: Request) {
  if (!TOKEN || !WEBHOOK_SECRET) {
    return NextResponse.json(
      { ok: false, erro: "Bot Gestor nao configurado." },
      { status: 500 }
    );
  }
  const secretRecebido = req.headers.get("x-telegram-bot-api-secret-token");
  if (secretRecebido !== WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = await req.json();
  const chatId: string | undefined =
    update?.message?.chat?.id?.toString() ??
    update?.callback_query?.message?.chat?.id?.toString();
  if (!chatId) {
    return NextResponse.json({ ok: true });
  }

  const autorizado = await ehAdminMaster(chatId);
  if (!autorizado) {
    await sendTelegramMessageComBotoes(TOKEN, chatId, "🔒 Acesso restrito ao Bot Gestor.");
    return NextResponse.json({ ok: true });
  }

  try {
    if (update.callback_query) {
      const cq = update.callback_query;
      await responderTelegramCallback(TOKEN, cq.id);
      const data = cq.data as string;

      if (data === "menu") {
        await sendTelegramMessageComBotoes(TOKEN, chatId, "Escolha uma opção:", MENU);
      } else if (data === "estoque_sku") {
        await definirEstado(chatId, "estoque_sku");
        await sendTelegramMessageComBotoes(
          TOKEN,
          chatId,
          "Digite o SKU ou parte da descrição do produto:"
        );
      } else if (data === "vendas_periodo") {
        await definirEstado(chatId, "periodo_inicio");
        await sendTelegramMessageComBotoes(
          TOKEN,
          chatId,
          "Digite a data inicial (formato DD/MM/AAAA):"
        );
      } else {
        const respostas: Record<string, () => Promise<string>> = {
          vendas_hoje: respostaVendasHoje,
          vendas_mes: respostaVendasMes,
          vendas_ano: respostaVendasAno,
          vendas_sku: respostaVendasPorSku,
          vendas_conta: respostaVendasPorConta,
          visitas_hoje: respostaVisitasHoje,
          containers_mes: respostaContainersMes,
        };
        const handler = respostas[data];
        if (handler) {
          const texto = await handler();
          await sendTelegramMessageComBotoes(TOKEN, chatId, texto, MENU);
        }
      }
    } else if (update.message) {
      const texto: string = (update.message.text ?? "").trim();
      if (texto === "/start" || texto === "/menu") {
        await definirEstado(chatId, null);
        await sendTelegramMessageComBotoes(
          TOKEN,
          chatId,
          "👋 Bem-vindo ao <b>Bot Gestor</b>. Escolha uma opção:",
          MENU
        );
      } else {
        const estado = await lerEstado(chatId);
        if (estado.aguardando === "estoque_sku" && texto) {
          await definirEstado(chatId, null);
          const resposta = await respostaEstoqueSku(texto);
          await sendTelegramMessageComBotoes(TOKEN, chatId, resposta, MENU);
        } else if (estado.aguardando === "periodo_inicio" && texto) {
          const inicio = parseDataBR(texto);
          if (!inicio) {
            await sendTelegramMessageComBotoes(
              TOKEN,
              chatId,
              "Data inválida. Digite no formato DD/MM/AAAA:"
            );
          } else {
            await definirEstado(chatId, "periodo_fim", inicio);
            await sendTelegramMessageComBotoes(
              TOKEN,
              chatId,
              `Início: ${formatarDataBR(
                inicio
              )}. Agora digite a data final (DD/MM/AAAA):`
            );
          }
        } else if (estado.aguardando === "periodo_fim" && texto) {
          const fim = parseDataBR(texto);
          const inicio = estado.dado;
          if (!fim || !inicio) {
            await definirEstado(chatId, null);
            await sendTelegramMessageComBotoes(
              TOKEN,
              chatId,
              "Data inválida. Use o menu para tentar novamente:",
              MENU
            );
          } else {
            await definirEstado(chatId, null);
            const periodo = periodoDeDatas(inicio, fim);
            const resposta = await respostaVendasResumo(
              periodo,
              `🗓️ Vendas de ${formatarDataBR(inicio)} até ${formatarDataBR(fim)}`
            );
            await sendTelegramMessageComBotoes(TOKEN, chatId, resposta, MENU);
          }
        } else {
          await sendTelegramMessageComBotoes(TOKEN, chatId, "Use o menu abaixo:", MENU);
        }
      }
    }
  } catch (erro) {
    console.error("Erro no Bot Gestor:", erro);
    await sendTelegramMessageComBotoes(
      TOKEN,
      chatId,
      "⚠️ Ocorreu um erro ao processar. Tente novamente."
    );
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, info: "Bot Gestor webhook ativo." });
}
