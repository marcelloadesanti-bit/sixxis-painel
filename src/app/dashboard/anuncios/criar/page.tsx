import Link from "next/link";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { createClient } from "@/lib/supabase/server";
import { COR_PADRAO } from "@/lib/account-colors";
import CriarAnuncioForm from "./criar-anuncio-form";

export default async function CriarAnuncioPage() {
  const { podeEditar } = await exigirAcessoSecao("anuncios", "criar");

  const supabase = await createClient();
  const { data: contasRaw } = await supabase
    .from("ml_accounts")
    .select("id, nickname, cor")
    .order("nickname", { ascending: true });

  const contas = (contasRaw ?? []).map((c) => ({
    id: c.id as string,
    nickname: c.nickname as string,
    cor: (c.cor as string) ?? COR_PADRAO,
  }));

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link href="/dashboard/anuncios/gestao" className="text-sm text-[var(--color-sixxis-blue)] underline">
        ← Voltar para Editar anúncios
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Criar anúncio</h1>
      <p className="mb-6 text-sm text-gray-500">
        Escolha a categoria, preencha os dados e selecione em quais contas publicar.
      </p>

      {!podeEditar ? (
        <p className="rounded bg-yellow-50 p-4 text-sm text-yellow-700">
          Seu acesso aqui é somente leitura — você não pode publicar anúncios.
        </p>
      ) : contas.length === 0 ? (
        <p className="rounded bg-yellow-50 p-4 text-sm text-yellow-700">
          Conecte ao menos uma conta do Mercado Livre antes de criar um anúncio.
        </p>
      ) : (
        <CriarAnuncioForm contas={contas} />
      )}
    </div>
  );
}
