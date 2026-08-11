import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listarEventos } from "@/lib/google/calendar";

export async function GET(request: NextRequest) {
    const supabase = await createClient();
    const {
          data: { user },
    } = await supabase.auth.getUser();

  if (!user) {
        return NextResponse.json({ error: "Nao autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
    const inicio = searchParams.get("inicio");
    const fim = searchParams.get("fim");

  if (!inicio || !fim) {
        return NextResponse.json(
          { error: "Parametros inicio e fim sao obrigatorios" },
          { status: 400 }
              );
  }

  try {
        const eventos = await listarEventos(
                user.id,
                new Date(inicio),
                new Date(fim)
              );
        return NextResponse.json({ eventos });
  } catch (error) {
        console.error("Erro ao listar eventos do Google Calendar:", error);
        return NextResponse.json(
          { error: "Erro ao buscar eventos" },
          { status: 500 }
              );
  }
}
