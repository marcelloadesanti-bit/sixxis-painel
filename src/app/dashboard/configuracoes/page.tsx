import { createClient } from "@/lib/supabase/server";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import GerenciarColaboradores from "./gerenciar-colaboradores";
import GerenciarAdministradores from "./gerenciar-administradores";
import type { PermissoesUsuario } from "@/lib/permissoes";

export default async function ConfiguracoesPage() {
  const { isAdmin, podeEditar } = await exigirAcessoSecao("equipe");

  const supabase = await createClient();

  const { data: colaboradoresRaw } = await supabase
    .from("profiles")
    .select("id, full_name, email, permissoes")
    .eq("role", "colaborador")
    .order("full_name");

  const colaboradores = (colaboradoresRaw ?? []).map((c) => ({
    id: c.id as string,
    fullName: (c.full_name as string) ?? "",
    email: (c.email as string) ?? "",
    permissoes: (c.permissoes as PermissoesUsuario) ?? {},
  }));

  // A lista de administradores so e buscada/exibida para o admin master -
  // um administrador comum (mesmo com edicao em "equipe") nunca ve nem
  // gerencia outros administradores.
  let administradores: typeof colaboradores = [];
  if (isAdmin) {
    const { data: administradoresRaw } = await supabase
      .from("profiles")
      .select("id, full_name, email, permissoes")
      .eq("role", "administrador")
      .order("full_name");

    administradores = (administradoresRaw ?? []).map((a) => ({
      id: a.id as string,
      fullName: (a.full_name as string) ?? "",
      email: (a.email as string) ?? "",
      permissoes: (a.permissoes as PermissoesUsuario) ?? {},
    }));
  }

  return (
    <main className="p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">
        Configurações
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Gerencie os acessos da equipe. Apenas administradores veem esta página.
      </p>
      <div className="flex max-w-3xl flex-col gap-8">
        {isAdmin && <GerenciarAdministradores administradoresIniciais={administradores} />}
        <GerenciarColaboradores colaboradoresIniciais={colaboradores} podeGerenciar={podeEditar} />
      </div>
    </main>
  );
}
