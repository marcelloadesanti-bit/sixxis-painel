import Link from "next/link";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";

export default async function AmazonPublicidadePage() {
  await exigirAcessoSecao("amazon", "amz_publicidade");

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-[var(--color-sixxis-blue)] underline">
          ← Voltar ao painel
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Amazon · Publicidade</h1>
      </div>

      <div className="rounded border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500 dark:border-gray-700">
        Em breve. Por enquanto, a gestão de campanhas de Sponsored Products/Brands segue sendo feita
        direto no Seller Central / Advertising Console.
      </div>
    </main>
  );
}
