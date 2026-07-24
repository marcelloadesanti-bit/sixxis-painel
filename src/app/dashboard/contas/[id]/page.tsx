import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PALETA_CORES_CONTA } from "@/lib/account-colors";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
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

  const { podeEditar } = await exigirAcessoSecao("contas");
  if (!podeEditar) redirect("/dashboard/contas");

  const supabase = await createClient();
  const { data: conta } = await supabase
    .from("ml_accounts")
    .select("id, nickname, apelido, cor")
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
          Conta &quot;{conta.nickname}&quot; conectada com sucesso! Dê um apelido e escolha uma cor
          para identificá-la nos gráficos.
        </p>
      )}

      <h1 className="mt-4 mb-1 text-xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">
        Editar conta {conta.nickname}
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        O apelido e a cor identificam a conta nos gráficos, filtros e legendas do painel.
      </p>

      <form action={atualizarCorContaAction} className="flex flex-col gap-6">
        <input type="hidden" name="contaId" value={conta.id} />
        {nova === "1" && <input type="hidden" name="nova" value="1" />}

        <div>
          <label htmlFor="apelido" className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200">
            Apelido (opcional)
          </label>
          <input
            id="apelido"
            type="text"
            name="apelido"
            maxLength={40}
            defaultValue={conta.apelido ?? ""}
            placeholder={conta.nickname}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
          <p className="mt-1 text-xs text-gray-400">
            Nome usado em vez de &quot;{conta.nickname}&quot; em todo o painel. Deixe em branco para usar
            o nickname real da conta no Mercado Livre.
          </p>
        </div>

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
          {nova === "1" ? "Salvar e ir para o painel" : "Salvar alterações"}
        </button>
      </form>
    </main>
  );
}
