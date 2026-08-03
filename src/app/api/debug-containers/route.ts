import { lerIntervaloPlanilha } from "@/lib/google/sheets-auth";

// Rota TEMPORARIA de debug -- confirma se o service account ja enxerga a
// planilha "Pedidos Containers" e mostra o formato real das linhas/cabecalho
// antes de escrever o parser definitivo. Sera removida assim que a
// investigacao terminar (mesmo padrao das rotas debug-* anteriores).
const SPREADSHEET_ID = "1prVHEe_F9uMHV0K3t0mujLQLoqPJrPhaFaZ_WMi7vbs";

export async function GET() {
  try {
    const linhas = await lerIntervaloPlanilha(SPREADSHEET_ID, "Sheet1!A1:J15");
    return Response.json({ ok: true, linhas });
  } catch (err) {
    return Response.json(
      { ok: false, erro: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
