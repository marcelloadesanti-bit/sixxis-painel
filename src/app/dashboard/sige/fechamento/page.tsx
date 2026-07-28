import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import FechamentoClient from "./fechamento-client";

// Fechamento Mensal do SIGE: acao manual, de periodo livre (independente do
// dia em que e feita) -- ver detalhes no cabecalho de api/sige/fechamento.
export default async function SigeFechamentoPage() {
  const { podeEditar } = await exigirAcessoSecao("sige", "sige_fechamento");

  const admin = createAdminClient();
  const [{ data: canais }, { data: fechamentos }] = await Promise.all([
    admin.from("canais_manuais").select("id, nome, apelido, cor").eq("ativo", true).order("nome"),
    admin
      .from("sige_fechamentos")
      .select("id, rotulo, periodo_de, periodo_ate, fechado_em")
      .order("periodo_de", { ascending: false }),
  ]);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">
        SIGE · Fechamento Mensal
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Escolha o período que quer fechar (pode ser feito em qualquer dia, sempre puxando os dados do período
        escolhido). Preencha os canais manuais quando houver, confira o consolidado e feche -- o resultado fica
        gravado no Histórico de Desempenho.
      </p>
      <FechamentoClient
        canais={(canais ?? []).map((c) => ({ id: c.id, nome: c.apelido || c.nome, cor: c.cor ?? "#64748b" }))}
        fechamentosExistentes={fechamentos ?? []}
        podeEditar={podeEditar}
      />
    </main>
  );
}
