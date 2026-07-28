import { exigirAcessoSecao } from "@/lib/permissoes-guard";

// Historico de Desempenho do SIGE -- equivalente automatizado das abas
// "Dashboard" / "Dashboard Ads" da planilha SIEGE. Populado automaticamente
// a cada Fechamento Mensal concluido (ver sige/fechamento) -- por isso ainda
// fica vazio ate a pagina de Fechamento estar pronta e o primeiro fechamento
// ser feito.
export default async function SigeHistoricoPage() {
  await exigirAcessoSecao("sige", "sige_historico");

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">
        SIGE · Histórico de Desempenho
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Aqui vão aparecer os fechamentos mensais já realizados, com comparativos mês a mês e ano a ano -- populado
        automaticamente sempre que um Fechamento Mensal for concluído.
      </p>
      <p className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400 dark:border-gray-600">
        Nenhum fechamento realizado ainda.
      </p>
    </main>
  );
}
