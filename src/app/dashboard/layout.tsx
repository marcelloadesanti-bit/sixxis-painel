import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppSidebar from "./app-sidebar";
import LogoutButton from "./logout-button";

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
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin";

  return (
    <div className="min-h-screen bg-gray-50">
      <AppSidebar />
      <div className="pl-16">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--color-sixxis-navy)]">Painel Sixxis</p>
            <p className="text-xs text-gray-500">
              {profile?.full_name ?? user.email} · {isAdmin ? "Administrador" : "Colaborador"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <a
                href="/api/mercadolivre/connect"
                className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
              >
                + Conectar conta
              </a>
            )}
            <LogoutButton />
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
