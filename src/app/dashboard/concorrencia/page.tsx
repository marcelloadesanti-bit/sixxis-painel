import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import ConcorrenciaView from "./concorrencia-view";

// Concorrencia: inteligencia competitiva 100% baseada em APIs OFICIAIS do
// Mercado Livre (mesmo token OAuth do resto do painel) -- sem scraping.
//
// O endpoint publico de busca geral (/sites/{site}/search) esta bloqueado
// (403) para o nosso app (ML restringe a parceiros aprovados). Em vez disso,
// usamos 3 APIs oficiais equivalentes:
// - /suggestions (benchmark de preco por anuncio nosso vs concorrencia)
// - /highlights (mais vendidos por categoria)
// - /products (detalhe publico de produto de catalogo de terceiros)
//
// Ver lib/mercadolivre/concorrencia.ts para o detalhe de cada chamada.
export const maxDuration = 60;

export default async function ConcorrenciaPage() {
  await exigirAcessoSecao("concorrencia");

  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">Concorrência</h1>
      <p className="mb-6 text-sm text-gray-500">
        Inteligência competitiva com dados oficiais do Mercado Livre: benchmark de preço por anúncio e ranking de
        mais vendidos por categoria.
      </p>
      <ConcorrenciaView />
    </div>
  );
}
