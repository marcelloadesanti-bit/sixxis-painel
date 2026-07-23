import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PALETA_CORES_CONTA } from "@/lib/account-colors";
import { atualizarCorContaAction } from "../actions";

export default async function EscolherCorContaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nova?: string }>;
}) {
  const { id } = await params;
  const { nova } = await searchParams;
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

  const { data: conta } = await supabase
    .from("ml_accounts")
    .select("id, nickname, cor")
    .eq("id", id)
    .maybeSingle();

  if (!conta) notFound();

  return (
    <main className="mx-auto max-w-lg p-6">
      <Link href="/dashboard" className="text-sm text-[var(--color-sixxis-blue)] underline">
        ← Voltar ao painel
      </Link>

      {nova === "1" && (
        <p className="mt-4 rounded bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          Conta &quot;{conta.nickname}&quot; conectada com sucesso! Escolha uma cor para identificá-la
          nos gráficos.
        </p>
      )}

      <h1 className="mt-4 mb-1 text-xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">
        Cor da conta {conta.nickname}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Essa cor identifica a conta nos gráficos e legendas do painel.
      </p>

      <form action={atualizarCorContaAction} className="flex flex-col gap-6">
        <input type="hidden" name="contaId" value={conta.id} />
        {nova === "1" && <input type="hidden" name="nova" value="1" />}

        <div className="grid grid-cols-6 gap-3">
          {PALETA_CORES_CONTA.map((c) => (
            <label key={c.hex} className="flex cursor-pointer flex-col items-center gap-1">
              <input
                type="radio"
                name="cor"
                value={c.hex}
                defaultChecked={conta.cor === c.hex}
                className="peer sr-only"
              />
              <span
                title={c.nome}
                style={{ backgroundColor: c.hex }}
                className="h-10 w-10 rounded-full border-2 border-transparent peer-checked:border-gray-900 peer-checked:ring-2 peer-checked:ring-offset-2 peer-checked:ring-gray-400 dark:peer-checked:border-white"
              />
              <span className="text-[10px] text-gray-500">{c.nome}</span>
            </label>
          ))}
        </div>

        <button
          type="submit"
          className="rounded bg-[var(--color-sixxis-navy)] px-4 py-2 text-sm font-medium text-white"
        >
          {nova === "1" ? "Salvar e ir para o painel" : "Salvar cor"}
        </button>
      </form>
    </main>
  );
}
