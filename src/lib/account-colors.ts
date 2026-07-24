// Paleta fixa de cores para identificar cada conta ML nos graficos/legendas
// do painel. Cores escolhidas para serem distintas e legiveis lado a lado
// (tanto no modo claro quanto no escuro).
// Azul/Amarelo/Verde/Laranja usam os tons vibrantes definidos pelo usuario
// (2026-07-24) -- as versoes anteriores desses quatro tons ficavam escuras
// demais nos graficos.
export const PALETA_CORES_CONTA: { hex: string; nome: string }[] = [
  { hex: "#ec4899", nome: "Rosa" },
  { hex: "#008aff", nome: "Azul" },
  { hex: "#34b900", nome: "Verde" },
  { hex: "#ffd200", nome: "Amarelo" },
  { hex: "#f38400", nome: "Laranja" },
  { hex: "#8b5cf6", nome: "Roxo" },
  { hex: "#0891b2", nome: "Ciano" },
  { hex: "#dc2626", nome: "Vermelho" },
  { hex: "#65a30d", nome: "Lima" },
  { hex: "#db2777", nome: "Magenta" },
  { hex: "#1f3864", nome: "Navy" },
  { hex: "#4338ca", nome: "Índigo" },
];

export const COR_PADRAO = "#64748b";

// Nome de exibicao de uma conta: usa o apelido definido pelo usuario quando
// existir, caindo para o nickname real da conta no Mercado Livre. Usar essa
// funcao em qualquer lugar do painel que mostre o "nome" de uma conta, para
// que o apelido se propague de forma consistente.
export function nomeConta(conta: { nickname: string; apelido?: string | null }): string {
  const apelido = conta.apelido?.trim();
  return apelido ? apelido : conta.nickname;
}
