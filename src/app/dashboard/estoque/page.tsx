import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { lerEstoquePlanilha } from "@/lib/estoque/planilha";
import EstoqueResumoPainel from "./estoque-painel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EstoquePage() {
  await exigirAcessoSecao("estoque", "estoque_resumo");

  const itens = await lerEstoquePlanilha();
  const categorias = Array.from(new Set(itens.map((i) => i.categoria).filter(Boolean))).sort();
  const consolidado = {
    totalSkus: itens.length,
    saldoTotal: itens.reduce((s, i) => s + i.saldoTotal, 0),
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Estoque</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Saldo lido diretamente da planilha "CONTROLE DE ESTOQUE SIXXIS" (somente leitura). Para risco de ruptura veja
        Métricas de estoque, e para os pedidos de importação a caminho veja Containers.
      </p>
      <EstoqueResumoPainel itens={itens} categorias={categorias} consolidado={consolidado} />
    </div>
  );
}
