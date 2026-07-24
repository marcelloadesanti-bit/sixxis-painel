import Link from "next/link";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";

export default async function CriarAnuncioPage() {
  await exigirAcessoSecao("anuncios", "criar");

  return (
    <div className="mx-auto max-w-3xl p-6">
      <Link href="/dashboard/anuncios" className="text-sm text-[var(--color-sixxis-blue)] underline">
        ← Voltar para Anúncios
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Criar novo anúncio</h1>
      <p className="mb-6 text-sm text-gray-500">Próxima etapa do painel.</p>
      <div className="rounded border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        Aqui você vai poder criar 1 anúncio e escolher em quais contas publicá-lo (uma, várias ou todas).
        Chega logo após validarmos o Resumo e a Gestão de anúncios.
      </div>
    </div>
  );
}
