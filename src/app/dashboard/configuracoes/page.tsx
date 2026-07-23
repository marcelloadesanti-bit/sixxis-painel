import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GerenciarColaboradores from "./gerenciar-colaboradores";
import type { PermissoesUsuario } from "@/lib/permissoes";

export default async function ConfiguracoesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    redirect("/dashboard");
  }

  const { data: colaboradoresRaw } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, permissoes")
    .neq("role", "admin")
    .order("full_name");

  const colaboradores = (colaboradoresRaw ?? []).map((c) => ({
    id: c.id as string,
    fullName: (c.full_name as string) ?? "",
    email: (c.email as string) ?? "",
    permissoes: (c.permissoes as PermissoesUsuario) ?? {},
  }));

  return (
    <main className="p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">
        Configurações
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Gerencie os acessos da equipe. Apenas administradores veem esta página.
      </p>
      <GerenciarColaboradores colaboradoresIniciais={colaboradores} />
    </main>
  );
}
