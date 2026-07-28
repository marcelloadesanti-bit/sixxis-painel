import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppSidebar from "./app-sidebar";
import LogoutButton from "./logout-button";
import ThemeToggle from "./theme-toggle";
import NotificationBell from "./notification-bell";
import SoundToggle from "./sound-toggle";
import Logo from "./logo";
import { SidebarProvider } from "./sidebar-context";
import DashboardContent from "./dashboard-content";
import { temAcessoSecao, podeEditar, type PermissoesUsuario } from "@/lib/permissoes";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, permissoes")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin";
  const isAdministrador = profile?.role === "administrador";
  const permissoes = (profile?.permissoes as PermissoesUsuario) ?? {};

  const rotuloCargo = isAdmin ? "Administrador master" : isAdministrador ? "Administrador" : "Colaborador";
  const podeEquipe = temAcessoSecao(isAdmin, permissoes, "equipe");
  const podeVerContas = temAcessoSecao(isAdmin, permissoes, "contas");
  const podeEditarContas = podeEditar(isAdmin, permissoes, "contas");
  const podeVerMetas = temAcessoSecao(isAdmin, permissoes, "metas");

  return (
    <div className="min-h-screen bg-gray-50">
      <SidebarProvider>
        <AppSidebar isAdmin={isAdmin} permissoes={permissoes} />
        <DashboardContent>
          <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
            <div className="flex items-center gap-3">
              <Logo />
              <div className="hidden sm:block">
                <p className="text-sm font-semibold text-[var(--color-sixxis-navy)]">Painel Sixxis</p>
                <p className="text-xs text-gray-500">
                  {profile?.full_name ?? user.email} · {rotuloCargo}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {podeEquipe && (
                <a
                  href="/dashboard/configuracoes"
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Configurações
                </a>
              )}
              {podeVerContas && (
                <a
                  href="/dashboard/contas"
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Contas conectadas
                </a>
              )}
              {podeVerMetas && (
                <a
                  href="/dashboard/configuracoes/metas"
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Metas
                </a>
              )}
              {podeEditarContas && (
                <a
                  href="/api/mercadolivre/connect"
                  className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
                >
                  + Conectar conta
                </a>
              )}
              <NotificationBell />
              <SoundToggle />
              <ThemeToggle />
              <LogoutButton />
            </div>
          </header>
          <main>{children}</main>
        </DashboardContent>
      </SidebarProvider>
    </div>
  );
}
