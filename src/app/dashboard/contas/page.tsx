import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function ContasPage() {
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
  if (profile?.role !== "admin") redirect("/dashboard");

  const { data: contas } = await supabase
    .from("ml_accounts")
    .select("id, nickname, site_id, cor")
    .order("nickname", { ascending: true });

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/dashboard" className="text-sm text-[var(--color-sixxis-blue)] underline">
        ← Voltar ao painel
      </Link>
      <h1 className="mt-4 mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">
        Contas conectadas
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Gerencie a cor de identificação de cada conta usada nos gráficos.
      </p>

      <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
        {(contas ?? []).map((c) => (
          <li key={c.id} className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span
                className="h-5 w-5 rounded-full border border-black/10"
                style={{ backgroundColor: c.cor ?? "#64748b" }}
              />
              <div>
                <p className="text-sm font-medium text-gray-800">{c.nickname}</p>
                <p className="text-xs text-gray-400">{c.site_id}</p>
              </div>
            </div>
            <Link
              href={`/dashboard/contas/${c.id}`}
              className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              Editar cor
            </Link>
          </li>
        ))}
      </ul>

      {(!contas || contas.length === 0) && (
        <p className="mt-6 text-sm text-gray-400">Nenhuma conta conectada ainda.</p>
      )}
    </main>
  );
}
