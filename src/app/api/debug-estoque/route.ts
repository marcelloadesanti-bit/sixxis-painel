// Rota TEMPORARIA de verificacao (sera removida apos confirmar a leitura da
// planilha ao vivo). Sem alteracao de dados -- so leitura.
import { NextResponse } from "next/server";
import { lerEstoquePlanilha } from "@/lib/estoque/planilha";

export async function GET() {
  try {
    const itens = await lerEstoquePlanilha();
    return NextResponse.json({
      total: itens.length,
      amostra: itens.slice(0, 5),
      somaSaldoTotal: itens.reduce((s, i) => s + i.saldoTotal, 0),
    });
  } catch (err) {
    return NextResponse.json({ erro: String(err) }, { status: 500 });
  }
}
