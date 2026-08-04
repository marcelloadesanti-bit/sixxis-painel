// Agrupamento de categorias do estoque em 3 grupos macro (Fase 14.2, 04/08/2026).
// A planilha ESTOQUE traz um texto livre de categoria (ver src/lib/estoque/planilha.ts,
// campo `categoria`), sem enum fixo. Para as abas Estoque e Métricas de estoque o
// usuário pediu para poder visualizar tudo somado (padrão) ou dividido em 3 grupos:
//
// - "saida": produtos com saída normal, sem ser partes -- Aspiradores, Climatizadores,
//   Fitness (e qualquer categoria nova de produto completo, ex.: "MODELO NOVO").
// - "partes_casa": Casa & Conforto + as categorias de partes e peças (Aspiradores,
//   Climatizadores, Fitness).
// - "seminovos": qualquer categoria de seminovo, de qualquer linha de produto.
//
// A classificação é por palavra-chave no texto da categoria (não por lista fixa),
// para não quebrar quando a planilha ganhar categorias novas: qualquer categoria
// contendo "seminovo" cai em seminovos; contendo "parte"/"peça"/"peca" ou "casa"
// cai em partes_casa; o resto (produto novo/completo) cai em saida.

export type GrupoId = "saida" | "partes_casa" | "seminovos";

export const GRUPOS: { id: GrupoId; label: string; labelCurto: string }[] = [
  { id: "saida", label: "Saída (Aspiradores, Climatizadores, Fitness)", labelCurto: "Saída" },
  { id: "partes_casa", label: "Partes & Casa (Casa & Conforto e peças)", labelCurto: "Partes & Casa" },
  { id: "seminovos", label: "Seminovos", labelCurto: "Seminovos" },
];

export function grupoDaCategoria(categoria: string): GrupoId {
  const c = (categoria ?? "").toLowerCase();
  if (c.includes("seminovo")) return "seminovos";
  if (c.includes("parte") || c.includes("peça") || c.includes("peca") || c.includes("casa")) return "partes_casa";
  return "saida";
}

export function labelGrupo(id: GrupoId): string {
  return GRUPOS.find((g) => g.id === id)?.labelCurto ?? id;
}

export function filtrarPorGrupo<T extends { categoria: string }>(itens: T[], grupo: GrupoId | null): T[] {
  if (!grupo) return itens;
  return itens.filter((i) => grupoDaCategoria(i.categoria) === grupo);
}
