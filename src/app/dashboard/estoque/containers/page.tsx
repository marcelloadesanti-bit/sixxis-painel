import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { listarContainers } from "@/lib/estoque/containers";
import ContainersPainel from "./containers-painel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ContainersPage() {
  const { podeEditar } = await exigirAcessoSecao("estoque", "estoque_containers");
  const containers = await listarContainers();

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Containers</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Controle manual dos pedidos de importação (containers a caminho). Substitui a planilha externa "Pedidos
        Containers" -- os dados daqui compensam a projeção de ruptura em Métricas de estoque.
      </p>
      <ContainersPainel containers={containers} podeEditar={podeEditar} />
    </div>
  );
}
