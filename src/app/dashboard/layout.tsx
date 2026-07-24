import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppSidebar from "./app-sidebar";
import LogoutButton from "./logout-button";
import ThemeToggle from "./theme-toggle";
import NotificationBell from "./notification-bell";
import Logo from "./logo";
import type { PermissoesUsuario } from "@/lib/permissoes";

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
  const permissoes = (profile?.permissoes as PermissoesUsuario) ?? {};

  return (
    <div className="min-h-screen bg-gray-50">
      <AppSidebar isAdmin={isAdmin} permissoes={permissoes} />
      <div className="pl-16">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="hidden sm:block">
              <p className="text-sm font-semibold text-[var(--color-sixxis-navy)]">Painel Sixxis</p>
              <p className="text-xs text-gray-500">
                {profile?.full_name ?? user.email} · {isAdmin ? "Administrador" : "Colaborador"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <a
                href="/dashboard/configuracoes"
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Configurações
              </a>
            )}
            {isAdmin && (
              <a
                href="/dashboard/contas"
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Contas conectadas
              </a>
            )}
            {isAdmin && (
              <a
                href="/dashboard/configuracoes/metas"
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Metas
              </a>
            )}
            {isAdmin && (
              <a
                href="/api/mercadolivre/connect"
                className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
              >
                + Conectar conta
              </a>
            )}
            <NotificationBell />
            <ThemeToggle />
            <LogoutButton />
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
