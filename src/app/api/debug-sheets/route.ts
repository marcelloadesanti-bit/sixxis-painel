import { NextResponse } from "next/server";
import { lerIntervaloPlanilha, getGoogleSheetsAccessToken } from "@/lib/google/sheets-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SPREADSHEET_ID = "1ZUunLgT4ggtjLZwJPHEu7cMsIsLel2Ww45ivMiyt90Q";

export async function GET() {
  try {
    const token = await getGoogleSheetsAccessToken();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent("ESTOQUE!A1:Z10")}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    const texto = await resp.text();
    return NextResponse.json({
      status: resp.status,
      ok: resp.ok,
      bodyPreview: texto.slice(0, 2000),
      tokenLength: token.length,
    });
  } catch (err) {
    return NextResponse.json({ erro: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
