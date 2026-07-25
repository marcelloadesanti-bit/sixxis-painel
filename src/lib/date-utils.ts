// Utilidades de data compartilhadas entre as paginas de filtro por periodo
// (Resumo, Metricas, Vendas): presets diario/7/15/30/personalizado e o
// calculo do "mesmo periodo do mes anterior" usado para comparacao.

export type PresetKey = "diario" | "7dias" | "15dias" | "30dias" | "personalizado";

export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: "diario", label: "Hoje" },
  { key: "7dias", label: "Últimos 7 dias" },
  { key: "15dias", label: "Últimos 15 dias" },
  { key: "30dias", label: "Últimos 30 dias" },
];

export function formatarData(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

export function periodoDoPreset(preset: PresetKey, hoje: Date): { de: string; ate: string } {
  const ate = formatarData(hoje);
  switch (preset) {
    case "diario":
      return { de: ate, ate };
    case "7dias":
      return { de: formatarData(new Date(hoje.getTime() - 6 * 86400000)), ate };
    case "15dias":
      return { de: formatarData(new Date(hoje.getTime() - 14 * 86400000)), ate };
    case "30dias":
    default:
      return { de: formatarData(new Date(hoje.getTime() - 29 * 86400000)), ate };
  }
}

// Volta uma data (YYYY-MM-DD) exatamente um mes, ajustando para o ultimo dia
// do mes alvo quando o mes de origem for mais longo (ex: 31/03 -> 28 ou 29/02).
function subtrairUmMes(dataStr: string): string {
  const [ano, mes, dia] = dataStr.split("-").map(Number);
  let novoAno = ano;
  let novoMes = mes - 1;
  if (novoMes < 1) {
    novoMes = 12;
    novoAno -= 1;
  }
  const ultimoDiaDoMes = new Date(novoAno, novoMes, 0).getDate();
  const novoDia = Math.min(dia, ultimoDiaDoMes);
  return `${novoAno}-${String(novoMes).padStart(2, "0")}-${String(novoDia).padStart(2, "0")}`;
}

// Dado um periodo (de, ate) qualquer - inclusive personalizado sem limite de
// duracao - retorna o mesmo intervalo exatamente um mes antes, para a
// comparacao automatica exigida em todas as telas com filtro de periodo.
export function periodoMesAnterior(de: string, ate: string): { de: string; ate: string } {
  return { de: subtrairUmMes(de), ate: subtrairUmMes(ate) };
}

export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (anterior === 0) return atual === 0 ? 0 : null;
  return ((atual - anterior) / anterior) * 100;
}

// Formata um total de minutos como "Xh Ymin" (ou so "Ymin" quando < 1h).
// Usado nos indicadores de SLA de atendimento (Pos-venda e Metas).
export function formatarDuracaoMin(min: number | null): string {
  if (min === null || Number.isNaN(min)) return "—";
  const totalMin = Math.round(min);
  const horas = Math.floor(totalMin / 60);
  const minutos = totalMin % 60;
  if (horas === 0) return `${minutos}min`;
  return `${horas}h ${minutos}min`;
}
