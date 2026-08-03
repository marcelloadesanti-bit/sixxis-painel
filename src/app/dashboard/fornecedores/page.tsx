import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { listarFornecedores, agruparPorCategoria } from "@/lib/fornecedores";
import FornecedoresPainel from "./fornecedores-painel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FornecedoresPage() {
  const { podeEditar } = await exigirAcessoSecao("fornecedores");
  const fornecedores = await listarFornecedores();
  const grupos = agruparPorCategoria(fornecedores);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Fornecedores</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Cadastro de fornecedores ativos e inativos, por categoria. Fornecedores ativos ficam selecionáveis
        automaticamente no formulário de Containers.
      </p>
      <FornecedoresPainel grupos={grupos} podeEditar={podeEditar} />
    </div>
  );
}
