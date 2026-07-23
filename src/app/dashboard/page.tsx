import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "./logout-button";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ conectado?: string; erro?: string }>;
}) {
  const params = await searchParams;
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

  const { data: contas } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname, site_id, created_at")
    .order("created_at", { ascending: true });

  const isAdmin = profile?.role === "admin";

  return (
    <main className="mx-auto min-h-screen max-w-4xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-sixxis-navy)]">
            Painel Sixxis
          </h1>
          <p className="text-sm text-gray-500">
            {profile?.full_name ?? user.email} ·{" "}
            {isAdmin ? "Administrador" : "Colaborador"}
          </p>
        </div>
        <LogoutButton />
      </div>

      {params.conectado && (
        <p className="mb-4 rounded bg-green-50 p-3 text-sm text-green-700">
          Conta &quot;{params.conectado}&quot; conectada com sucesso.
        </p>
      )}
      {params.erro && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700">{params.erro}</p>
      )}

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-800">
          Contas Mercado Livre conectadas ({contas?.length ?? 0})
        </h2>
        {isAdmin && (
          <a
            href="/api/mercadolivre/connect"
            className="rounded bg-[var(--color-sixxis-navy)] px-3 py-2 text-sm font-medium text-white"
          >
            + Conectar conta
          </a>
        )}
      </div>

      {!contas || contas.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Nenhuma conta Mercado Livre conectada ainda.
          {isAdmin && " Clique em \"Conectar conta\" para autorizar a primeira."}
        </div>
      ) : (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200">
          {contas.map((conta) => (
            <li key={conta.id} className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium text-gray-900">{conta.nickname}</p>
                <p className="text-xs text-gray-500">
                  ID {conta.ml_user_id} · Site {conta.site_id}
                </p>
              </div>
              <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                Conectada
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-10 grid grid-cols-2 gap-4 text-sm text-gray-400 sm:grid-cols-4">
        <div className="rounded border border-gray-100 p-4">Anúncios (em breve)</div>
        <div className="rounded border border-gray-100 p-4">Mercado Ads (em breve)</div>
        <div className="rounded border border-gray-100 p-4">Perguntas/Mensagens (em breve)</div>
        <div className="rounded border border-gray-100 p-4">Relatórios (em breve)</div>
      </div>
    </main>
  );
}
