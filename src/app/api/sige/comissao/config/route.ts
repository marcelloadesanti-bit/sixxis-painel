import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Configuracao da calculadora de comissao variavel do SIGE -- linha unica
// (id fixo 1) com pesos por canal (organico/pago/amazon), niveis de
// escalonamento (4 ativos + 2 reservados p/ o futuro) e recebedores (gestor
// + 2 reservados p/ o futuro). Restrito ao admin master -- essa secao NUNCA
// fica concedivel via o objeto permissoes JSONB (ver exigirMaster em
// lib/permissoes-guard.ts e o README de seguranca em
// dashboard/configuracoes/actions.ts).
export const maxDuration = 30;

async function exigirMaster() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return null;
  return user;
}

export async function GET() {
  const user = await exigirMaster();
  if (!user) {
    return NextResponse.json({ erro: "Apenas o administrador master pode acessar." }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sige_comissao_config")
    .select("pesos, niveis, recebedores, atualizado_em")
    .eq("id", 1)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ erro: "Falha ao carregar configuracao." }, { status: 500 });
  }

  return NextResponse.json(data);
}

type Nivel = { nivel: number; minima: number; maxima: number; comissao: number; ativo: boolean };
type Recebedor = { nome: string; ativo: boolean; percentual: number };

export async function POST(request: Request) {
  const user = await exigirMaster();
  if (!user) {
    return NextResponse.json({ erro: "Apenas o administrador master pode alterar." }, { status: 403 });
  }

  const body = (await request.json()) as {
    pesos?: { organico: number; pago: number; amazon: number };
    niveis?: Nivel[];
    recebedores?: Recebedor[];
  };

  if (!body.pesos || !body.niveis || !body.recebedores) {
    return NextResponse.json({ erro: "Dados incompletos." }, { status: 400 });
  }
  if (body.niveis.length !== 6) {
    return NextResponse.json({ erro: "A configuracao precisa ter exatamente 6 niveis." }, { status: 400 });
  }
  if (body.recebedores.length !== 3) {
    return NextResponse.json({ erro: "A configuracao precisa ter exatamente 3 recebedores." }, { status: 400 });
  }
  const somaPesos = body.pesos.organico + body.pesos.pago + body.pesos.amazon;
  if (Math.abs(somaPesos - 100) > 0.05) {
    return NextResponse.json(
      { erro: `A soma dos pesos dos canais deve ser 100% (atual: ${somaPesos.toFixed(1)}%).` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("sige_comissao_config")
    .update({
      pesos: body.pesos,
      niveis: body.niveis,
      recebedores: body.recebedores,
      atualizado_em: new Date().toISOString(),
      atualizado_por: user.id,
    })
    .eq("id", 1);

  if (error) {
    return NextResponse.json({ erro: "Falha ao salvar configuracao." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
