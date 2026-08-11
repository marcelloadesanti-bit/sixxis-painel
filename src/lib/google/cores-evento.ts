export type CorGoogle = { id: string; nome: string; hex: string };

export const CORES_GOOGLE: CorGoogle[] = [
{ id: "1", nome: "Lavanda", hex: "#7986cb" },
{ id: "2", nome: "Salvia", hex: "#33b679" },
{ id: "3", nome: "Uva", hex: "#8e24aa" },
{ id: "4", nome: "Flamingo", hex: "#e67c73" },
{ id: "5", nome: "Banana", hex: "#f6c026" },
{ id: "6", nome: "Tangerina", hex: "#f5511d" },
{ id: "7", nome: "Peacock", hex: "#039be5" },
{ id: "8", nome: "Grafite", hex: "#616161" },
{ id: "9", nome: "Blueberry", hex: "#3f51b5" },
{ id: "10", nome: "Manjericao", hex: "#0b8043" },
{ id: "11", nome: "Tomate", hex: "#d60000" },
];

export const CATEGORIAS_TAREFA: { id: string; nome: string; colorId: string }[] = [
{ id: "reuniao", nome: "Reuniao", colorId: "7" },
{ id: "financeiro", nome: "Financeiro", colorId: "10" },
{ id: "pessoal", nome: "Pessoal", colorId: "1" },
{ id: "outro", nome: "Outro", colorId: "8" },
];

function hexParaRgb(hex: string): [number, number, number] {
  const limpo = hex.replace("#", "");
  const r = parseInt(limpo.substring(0, 2), 16);
  const g = parseInt(limpo.substring(2, 4), 16);
  const b = parseInt(limpo.substring(4, 6), 16);
  return [r, g, b];
}

export function corGoogleMaisProxima(hex: string): string {
    const [r1, g1, b1] = hexParaRgb(hex);
    let melhorId = CORES_GOOGLE[0].id;
  let menorDistancia = Infinity;
  for (const cor of CORES_GOOGLE) {
        const [r2, g2, b2] = hexParaRgb(cor.hex);
        const distancia = (r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2;
        if (distancia < menorDistancia) {
          menorDistancia = distancia;
          melhorId = cor.id;
    }
    }
      return melhorId;
    }

    export function hexDaCor(colorId: string | null | undefined): string {
      return CORES_GOOGLE.find((c) => c.id === colorId)?.hex ?? "#64748b";
    }
    
