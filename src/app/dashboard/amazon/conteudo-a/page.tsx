import Link from "next/link";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";

export default async function AmazonConteudoAPage() {
  await exigirAcessoSecao("amazon", "amz_conteudo_a");

  return (
    <main className="mx-auto min-h-screen max-w-5xl p-6">
      <div className="mb-6">
        <Link href="/dashboard" className="text-sm text-[var(--color-sixxis-blue)] underline">
          ← Voltar ao painel
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Amazon · Conteúdo A+</h1>
      </div>

      <div className="rounded border border-dashed border-gray-300 p-10 text-center text-sm text-gray-500 dark:border-gray-700">
        Em breve. Por enquanto, a criação e edição de Conteúdo A+ segue sendo feita direto no Seller
        Central.
      </div>
    </main>
  );
}
