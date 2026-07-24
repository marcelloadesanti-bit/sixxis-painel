import Link from "next/link";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import TendenciasView from "./tendencias-view";

export default async function TendenciasPage() {
  await exigirAcessoSecao("anuncios", "tendencias_busca");

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link href="/dashboard/anuncios" className="text-sm text-[var(--color-sixxis-blue)] underline">
        ← Voltar para Anúncios
      </Link>
      <h1 className="mt-2 mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Tendências de busca</h1>
      <p className="mb-6 text-sm text-gray-500">
        Termos mais buscados no Mercado Livre (atualizado semanalmente pelo ML). Pesquise um produto para ver a
        categoria correspondente, ou explore por categoria — inclusive fora do que você já vende hoje.
      </p>
      <TendenciasView />
    </div>
  );
}
