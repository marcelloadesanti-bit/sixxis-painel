import { exigirAcessoSecao } from "@/lib/permissoes-guard";

export default async function FaturamentoPage() {
  await exigirAcessoSecao("faturamento");
  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Faturamento</h1>
      <p className="mb-6 text-sm text-gray-500">Tarifas e cobranças do Mercado Livre</p>
      <div className="rounded border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        Próxima prioridade após as integrações principais (Resumo, Vendas, Pós-venda). Vai reunir
        aqui as faturas de tarifa do Mercado Livre e seus relatórios detalhados, por conta.
      </div>
    </div>
  );
}
