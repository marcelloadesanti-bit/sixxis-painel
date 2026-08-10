// Motor de alertas/diagnostico de desempenho de Ads -- cruza TACOS/ROAS em
// 3 niveis (anuncio, campanha, conta) contra as metas configuradas
// (metas_ads) e gera um semaforo + sugestao de causa provavel.
//
// Regras de negocio (confirmadas com o usuario):
// - TACOS de anuncio = investimento do anuncio / vendas do anuncio (mesmo
//   calculo do ACOS naquele nivel).
// - TACOS de campanha = investimento da campanha / vendas da campanha
//   (equivale ao campo "acos" que a propria API do Mercado Ads retorna).
// - TACOS de conta = investimento total em Ads da conta / faturamento TOTAL
//   da conta (incluindo vendas organicas) -- esse e o unico nivel que usa o
//   conceito "puro" de TACOS; os outros dois sao, na pratica, ACOS.
// - Semaforo: Otimo (dentro/melhor que a meta), Padrao (ate 10% de
//   tolerancia fora da meta), Critico (alem dessa faixa). Tolerancia de 10%
//   confirmada com o usuario.
//
// O motor de sugestao de causa e baseado em REGRAS (if/else), nao em IA --
// combina sinais que o painel ja possui em outros lugares (Central de
// Qualidade, saude/completude do anuncio) sem fazer nenhuma chamada de API
// nova alem das que a propria pagina de Metricas de Desempenho ja faz.
//
// LIMITACAO CONHECIDA (comunicada ao usuario): a API do Mercado Livre nao
// expõe CTR por FOTO -- so existe o CTR do anuncio inteiro. Por isso nao ha
// como apontar "essa foto especifica esta com problema", apenas sinais
// indiretos (saude/completude da ficha, score de qualidade, CTR geral).

import type { QualidadeAnuncio } from "./qualidade";

export type NivelMetrica = "anuncio" | "campanha" | "conta";
export type Semaforo = "otimo" | "padrao" | "critico";

const TOLERANCIA = 0.1;

export function tacosDe(investimento: number, vendas: number): number | null {
    return vendas > 0 ? (investimento / vendas) * 100 : null;
}

export function classificarTacos(tacosPct: number | null, metaTacosPct: number | null): Semaforo | null {
    if (tacosPct === null || metaTacosPct === null || metaTacosPct <= 0) return null;
    if (tacosPct <= metaTacosPct) return "otimo";
    if (tacosPct <= metaTacosPct * (1 + TOLERANCIA)) return "padrao";
    return "critico";
}

export function classificarRoas(roas: number | null, metaRoas: number | null): Semaforo | null {
    if (roas === null || metaRoas === null || metaRoas <= 0) return null;
    if (roas >= metaRoas) return "otimo";
    if (roas >= metaRoas * (1 - TOLERANCIA)) return "padrao";
    return "critico";
}

const RANQUE: Record<Semaforo, number> = { critico: 0, padrao: 1, otimo: 2 };

// Combina os semaforos de TACOS e ROAS no PIOR dos dois -- qualquer metrica
// fora da meta e suficiente para acender o alerta. Se so uma das metas
// estiver configurada, usa so a que existir; se nenhuma estiver, "otimo"
// (sem meta, sem alerta).
export function combinarSemaforo(a: Semaforo | null, b: Semaforo | null): Semaforo {
    const validos = [a, b].filter((s): s is Semaforo => s !== null);
    if (validos.length === 0) return "otimo";
    return validos.reduce((pior, atual) => (RANQUE[atual] < RANQUE[pior] ? atual : pior));
}

// Motivo generico (niveis campanha/conta) -- so sabemos qual das duas
// metricas estourou, sem sinais granulares de causa.
export function motivoGenerico(tacosSemaforo: Semaforo | null, roasSemaforo: Semaforo | null): string {
    const tacosRuim = tacosSemaforo === "critico" || tacosSemaforo === "padrao";
    const roasRuim = roasSemaforo === "critico" || roasSemaforo === "padrao";
    if (tacosRuim && roasRuim) return "TACOS acima e ROAS abaixo do configurado na meta.";
    if (tacosRuim) return "TACOS acima do teto configurado na meta.";
    if (roasRuim) return "ROAS abaixo do mínimo configurado na meta.";
    return "Dentro da meta.";
}

export type SinaisDiagnostico = {
    ctr: number | null;
    saude: number | null;
    qualidade: QualidadeAnuncio | null;
};

// Motivo detalhado (nivel anuncio) -- cruza os sinais que ja temos
// disponiveis (Central de Qualidade lida do cache + saude/completude do
// item + CTR do proprio anuncio) para sugerir a causa mais provavel.
// Prioridade: qualidade > completude da ficha > CTR > generico (oferta).
export function sugerirMotivo(semaforo: Semaforo, sinais: SinaisDiagnostico): string {
    if (semaforo === "otimo") return "Dentro da meta.";

  const pendencias = sinais.qualidade?.pendencias?.length ?? 0;
    const score = sinais.qualidade?.score ?? null;
    const scoreBaixo = score !== null && score < 60;
    const saudeBaixa = sinais.saude !== null && sinais.saude < 0.6;
    const ctrBaixo = sinais.ctr !== null && sinais.ctr < 0.02;

  if (scoreBaixo || pendencias > 0) {
        return "Score de qualidade baixo ou com pendências — revise título, ficha técnica e fotos na Central de Qualidade.";
  }
    if (saudeBaixa) {
          return "Ficha do anúncio incompleta (saúde baixa) — completar atributos/fotos ajuda a conversão orgânica e reduz a dependência de Ads.";
    }
    if (ctrBaixo) {
          return "CTR baixo — o anúncio aparece mas atrai pouco clique; revise título, foto principal ou o termo de busca alvo.";
    }
    return "CTR e ficha do anúncio parecem normais — o problema provável é de oferta (preço, estoque ou concorrência), não da campanha em si.";
}
