// Metricas de estoque (Fase 12, 31/07/2026; Fase 13, 03/08/2026).
// Cruza o saldo lido da planilha (SOMENTE LEITURA, ver src/lib/estoque/planilha.ts)
// com a velocidade de venda por SKU (ultimos 60 dias, todas as contas ML
// conectadas) para projetar dias ate a ruptura e classificar o risco.
//
// Janela de vendas e lead time confirmados com o usuario:
// - Velocidade de venda: media diaria dos ultimos 60 dias.
// - Lead time de compra: 45 dias -> abaixo disso = CRITICO.
// - Zona de atencao: entre 45 e 68 dias (1.5x o lead time) -> alerta antecipado.
// - Acima de 68 dias, ou sem nenhuma venda no periodo -> OK.
//
// Fase 13 (03/08/2026): a projecao de ruptura passa a ser compensada pelos
// pedidos de container ainda nao chegados (ver src/lib/estoque/containers.ts,
// que substitui a antiga planilha externa "Pedidos Containers"). Um SKU com
// poucos dias de estoque mas com um container chegando antes da ruptura deixa
// de ser classificado como critico.

import { getProdutosMaisVendidos, periodoDeDatas } from "@/lib/mercadolivre/orders";
import { getMaisVendidosPorSku } from "@/lib/mercadolivre/items";

export const JANELA_VELOCIDADE_DIAS = 60;
export const LEAD_TIME_DIAS = 45;
export const LIMITE_ATENCAO_DIAS = Math.round(LEAD_TIME_DIAS * 1.5); // 68 dias

export type ContaVelocidade = { id: string; mlUserId: string; accessToken: string };

// Soma as vendas por SKU dos ultimos `JANELA_VELOCIDADE_DIAS` dias em TODAS
// as contas informadas (mesmo SKU vendido em contas diferentes conta junto,
// ja que o saldo da planilha tambem e unico por SKU, nao por conta).
export async function calcularVelocidadePorSku(
  contas: ContaVelocidade[]
): Promise<Map<string, number>> {
  const hoje = new Date();
  const inicio = new Date(hoje.getTime() - JANELA_VELOCIDADE_DIAS * 24 * 60 * 60 * 1000);
  const de = inicio.toISOString().slice(0, 10);
  const ate = hoje.toISOString().slice(0, 10);
  const periodo = periodoDeDatas(de, ate);

  const somaPorSku = new Map<string, number>();

  await Promise.all(
    contas.map(async (conta) => {
      try {
        const ranking = await getProdutosMaisVendidos(conta.accessToken, Number(conta.mlUserId), periodo);
        const porSku = await getMaisVendidosPorSku(conta.accessToken, ranking);
        for (const r of porSku) {
          const chave = r.sku.trim().toUpperCase();
          somaPorSku.set(chave, (somaPorSku.get(chave) ?? 0) + r.quantidade);
        }
      } catch (err) {
        console.error(`Erro ao calcular velocidade de vendas da conta ${conta.id}:`, err);
      }
    })
  );

  return somaPorSku;
}

export type NivelRisco = "critico" | "atencao" | "ok" | "sem_venda";

export function classificarRisco(diasAteRuptura: number | null): NivelRisco {
  if (diasAteRuptura === null) return "sem_venda";
  if (diasAteRuptura <= LEAD_TIME_DIAS) return "critico";
  if (diasAteRuptura <= LIMITE_ATENCAO_DIAS) return "atencao";
  return "ok";
}

// dias = null quando nao ha venda no periodo (velocidade 0) -- nesse caso
// nao da pra projetar ruptura por falta de demanda observada.
export function projetarDiasAteRuptura(saldoTotal: number, quantidade60d: number): number | null {
  const velocidadeDiaria = quantidade60d / JANELA_VELOCIDADE_DIAS;
  if (velocidadeDiaria <= 0) return null;
  return Math.floor(saldoTotal / velocidadeDiaria);
}

// Fase 13: compensacao da projecao de ruptura com os pedidos de container
// ainda nao chegados de um SKU (ver containersPendentesPorSku em
// src/lib/estoque/containers.ts). Simula o consumo diario do saldo e, ao
// encontrar um container cuja previsao de chegada e anterior a data em que o
// saldo chegaria a zero, soma a quantidade dele e continua a simulacao a
// partir dali -- podendo empurrar a ruptura para bem mais longe (ou remove-la
// da classificacao critica). Containers sem `dataPrevChegada` sao ignorados
// na simulacao (nao da pra saber quando chegam), mas continuam listados na
// aba Containers.
export type ContainerPendente = { quantidade: number; dataPrevChegada: string | null };

export function projetarRupturaComContainers(
  saldoTotal: number,
  velocidadeDiaria: number,
  containers: ContainerPendente[]
): { diasAteRuptura: number | null; proximaChegada: { data: string; quantidade: number } | null } {
  if (velocidadeDiaria <= 0) return { diasAteRuptura: null, proximaChegada: null };

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const pendentes = containers
    .filter((c): c is { quantidade: number; dataPrevChegada: string } => Boolean(c.dataPrevChegada))
    .map((c) => {
      const dataChegada = new Date(`${c.dataPrevChegada}T00:00:00`);
      const dia = Math.max(Math.round((dataChegada.getTime() - hoje.getTime()) / (24 * 60 * 60 * 1000)), 0);
      return { dia, quantidade: c.quantidade, dataPrevChegada: c.dataPrevChegada };
    })
    .sort((a, b) => a.dia - b.dia);

  const proximaChegada = pendentes[0]
    ? { data: pendentes[0].dataPrevChegada, quantidade: pendentes[0].quantidade }
    : null;

  let saldo = saldoTotal;
  let diaAtual = 0;

  for (const container of pendentes) {
    const diaRuptura = diaAtual + saldo / velocidadeDiaria;
    if (container.dia >= diaRuptura) {
      // A ruptura acontece antes desse container chegar -- containers
      // seguintes (mais distantes ainda) nao mudam esse resultado.
      return { diasAteRuptura: Math.floor(diaRuptura), proximaChegada };
    }
    // O container chega a tempo: consome o saldo ate a data dele e reabastece.
    saldo = saldo - velocidadeDiaria * (container.dia - diaAtual) + container.quantidade;
    diaAtual = container.dia;
  }

  const diasRestantes = diaAtual + saldo / velocidadeDiaria;
  return { diasAteRuptura: Math.floor(diasRestantes), proximaChegada };
}
