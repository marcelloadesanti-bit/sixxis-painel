const SECOES = [
  {
    titulo: "Perguntas",
    descricao: "Perguntas feitas por compradores nos anúncios, pendentes ou respondidas.",
  },
  {
    titulo: "Mensagens",
    descricao: "Mensagens pós-venda trocadas com compradores dentro dos pedidos.",
  },
  {
    titulo: "Reclamações em aberto",
    descricao: "Reclamações/mediações abertas no Mercado Livre que ainda precisam de resposta.",
  },
];

export default function PosVendaPage() {
  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Pós-venda</h1>
      <p className="mb-6 text-sm text-gray-500">
        Perguntas, mensagens e reclamações em aberto — consolidado de todas as contas
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SECOES.map((s) => (
          <div key={s.titulo} className="rounded border border-dashed border-gray-300 bg-white p-4">
            <p className="mb-1 text-sm font-semibold text-gray-800">{s.titulo}</p>
            <p className="text-xs text-gray-500">{s.descricao}</p>
            <p className="mt-3 text-xs font-medium text-gray-400">em desenvolvimento</p>
          </div>
        ))}
      </div>
    </div>
  );
}
