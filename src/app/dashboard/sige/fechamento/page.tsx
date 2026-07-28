import { exigirAcessoSecao } from "@/lib/permissoes-guard";

// Fechamento Mensal do SIGE -- proxima etapa da construcao (ver Relatorios,
// ja funcional, como primeira fatia entregue). Vai ter: selecao de periodo
// livre (independente do dia em que o fechamento e feito), coleta automatica
// de ML + Amazon para o periodo escolhido, campos manuais para Shopee/TikTok
// Shop/Netshoes-Magalu/Google Ads/Meta Ads daquele mesmo periodo, relatorio
// consolidado + individual por conta (nos moldes da planilha SIEGE), e um
// botao "Fechar" que congela tudo em sige_fechamentos/sige_fechamento_itens
// -- alimentando automaticamente o Historico de Desempenho.
export default async function SigeFechamentoPage() {
  await exigirAcessoSecao("sige", "sige_fechamento");

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">
        SIGE · Fechamento Mensal
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Próxima etapa da construção do SIGE: escolha de período livre (o fechamento de julho pode ser feito em
        qualquer dia, sempre puxando os dados do período escolhido), coleta automática de Mercado Livre e Amazon,
        preenchimento manual de Shopee / TikTok Shop / Netshoes-Magalu / Google Ads / Meta Ads, relatório
        consolidado + individual por conta, e um botão &quot;Fechar&quot; que grava o período no Histórico de
        Desempenho.
      </p>
      <p className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400 dark:border-gray-600">
        Em construção.
      </p>
    </main>
  );
}
