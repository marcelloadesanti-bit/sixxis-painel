// Metricas de estoque (Fase 12, 31/07/2026).
// Cruza o saldo lido da planilha (SOMENTE LEITURA, ver src/lib/estoque/planilha.ts)
// com a velocidade de venda por SKU (ultimos 60 dias, todas as contas ML
// conectadas) para projetar dias ate a ruptura e classificar o risco.
//
// Janela de vendas e lead time confirmados com o usuario:
// - Velocidade de venda: media diaria dos ultimos 60 dias.
// - Lead time de compra: 45 dias -> abaixo disso = CRITICO.
// - Zona de atencao: entre 45 e 68 dias (1.5x o lead time) -> alerta antecipado.
// - Acima de 68 dias, ou sem nenhuma venda no periodo -> OK.

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
