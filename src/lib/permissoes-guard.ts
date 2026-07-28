import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  temAcessoSecao,
  temAcessoSubsecao,
  podeEditar as podeEditarSecao,
  type CodigoSecao,
  type PermissoesUsuario,
} from "@/lib/permissoes";

// Guarda de acesso para usar no topo de cada page.tsx de secao do dashboard.
// Redireciona para /login se nao autenticado, e para /dashboard se o
// colaborador nao tiver permissao para ver aquela secao.
// Retorna dados uteis pra pagina decidir o que renderizar (ex: esconder botoes
// de acao quando o nivel for "leitura").
export async function exigirAcessoSecao(secao: CodigoSecao, subsecao?: string) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, permissoes")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin";
  const permissoes = (profile?.permissoes as PermissoesUsuario) ?? {};

  if (!temAcessoSecao(isAdmin, permissoes, secao)) {
    redirect("/dashboard");
  }

  if (subsecao && !temAcessoSubsecao(isAdmin, permissoes, secao, subsecao)) {
    redirect("/dashboard/pos-venda");
  }

  return {
    user,
    isAdmin,
    permissoes,
    podeEditar: podeEditarSecao(isAdmin, permissoes, secao),
  };
}

// Guarda para telas restritas ao admin master (role "admin"), que NUNCA
// devem ficar concedíveis via o objeto permissoes JSONB -- diferente das
// SECOES_ADMIN normais (equipe/contas/sige/metas), que um administrador
// comum pode receber acesso. Ex de uso: Metas & Comissão (SIGE). So existe 1
// admin master por definição (ver README de seguranca em
// dashboard/configuracoes/actions.ts sobre a distincao admin x administrador
// x colaborador). Redireciona para /dashboard se nao for o master.
export async function exigirMaster() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  return { user };
}
