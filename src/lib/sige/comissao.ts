export type Pesos = { organico: number; pago: number; amazon: number };
export type Nivel = { nivel: number; minima: number; maxima: number; comissao: number; ativo: boolean };
export type Recebedor = { nome: string; ativo: boolean; percentual: number };
export type ConfigComissao = { pesos: Pesos; niveis: Nivel[]; recebedores: Recebedor[] };

export type ResultadoCanal = {
  nome: string;
  meta: number;
  valor: number;
  percentual: number | null;
  nivel: Nivel | null;
  comissao: number;
};

export type ResultadoComissao = {
  metaTotal: number;
  faturamentoTotal: number;
  canais: ResultadoCanal[];
  comissaoTotal: number;
  recebedoresAtivos: (Recebedor & { valor: number })[];
  amazonBrutoInformativo: number;
};

// Usada tanto pela calculadora manual (comissao-client.tsx) quanto pela rota
// de calculo automatico diario (api/sige/comissao/atualizar) -- para as duas
// nunca divergirem no criterio de escalonamento.
export function encontrarNivel(pct: number, niveis: Nivel[]): Nivel | null {
  const ativos = niveis.filter((n) => n.ativo).sort((a, b) => a.minima - b.minima);
  if (ativos.length === 0) return null;
  for (const n of ativos) {
    if (pct >= n.minima && pct <= n.maxima) return n;
  }
  return ativos[ativos.length - 1];
}

// organico/pago ja devem vir com a divisao 50/50 do faturamento bruto da
// Amazon embutida (ver calcularCanaisAutomaticos) -- amazonBruto aqui e so
// para exibicao informativa, nunca soma de novo no total (evita duplicar).
export function calcularComissao({
  metaTotal,
  organico,
  pago,
  amazonBruto,
  config,
}: {
  metaTotal: number;
  organico: number;
  pago: number;
  amazonBruto: number;
  config: ConfigComissao;
}): ResultadoComissao {
  function calcCanal(nome: string, peso: number, valor: number): ResultadoCanal {
    const meta = metaTotal * (peso / 100);
    if (meta <= 0) {
      return { nome, meta, valor, percentual: null, nivel: null, comissao: 0 };
    }
    const percentual = (valor / meta) * 100;
    const nivel = encontrarNivel(percentual, config.niveis);
    const comissao = nivel ? (nivel.comissao / 100) * valor : 0;
    return { nome, meta, valor, percentual, nivel, comissao };
  }

  const canais = [
    calcCanal("Orgânico", config.pesos.organico, organico),
    calcCanal("Pago (Ads)", config.pesos.pago, pago),
  ];
  const faturamentoTotal = organico + pago;
  const comissaoTotal = canais.reduce((s, c) => s + c.comissao, 0);
  const recebedoresAtivos = config.recebedores
    .filter((r) => r.ativo)
    .map((r) => ({ ...r, valor: comissaoTotal * (r.percentual / 100) }));

  return { metaTotal, faturamentoTotal, canais, comissaoTotal, recebedoresAtivos, amazonBrutoInformativo: amazonBruto };
}

// Deriva organico/pago a partir dos numeros do periodo, aplicando a regra
// provisoria: faturamento BRUTO da Amazon (sem descontar taxas, ainda sem
// meta/Ads propria) e dividido 50/50 entre Organico e Pago. O restante (ML +
// canais manuais) usa faturamento LIQUIDO (bruto - cancelados - devolvidos).
export function calcularCanaisAutomaticos({
  baseNaoAmazon,
  amazonBruto,
  adsRetorno,
}: {
  baseNaoAmazon: number;
  amazonBruto: number;
  adsRetorno: number;
}): { organico: number; pago: number } {
  const organico = Math.max(0, baseNaoAmazon - adsRetorno) + amazonBruto / 2;
  const pago = adsRetorno + amazonBruto / 2;
  return { organico, pago };
}
