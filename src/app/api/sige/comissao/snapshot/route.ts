import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Leitura rapida do ultimo snapshot calculado (ver api/sige/comissao/atualizar)
// -- usada pelo card de "resumo automatico" ao carregar a pagina, sem
// precisar recalcular na hora (isso fica a cargo do cron diario ou do botao
// "Atualizar agora").
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: "Nao autorizado." }, { status: 401 });
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json({ erro: "Apenas o administrador master pode acessar." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("sige_comissao_snapshot")
    .select("ano, mes, resultado, calculado_em, disparado_por")
    .eq("id", 1)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ snapshot: null });
  }

  return NextResponse.json({
    snapshot: {
      ano: data.ano,
      mes: data.mes,
      resultado: data.resultado,
      calculadoEm: data.calculado_em,
      disparadoPor: data.disparado_por,
    },
  });
}
