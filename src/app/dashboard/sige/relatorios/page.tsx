import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import RelatorioClient from "./relatorio-client";

export default async function SigeRelatoriosPage() {
  const { podeEditar } = await exigirAcessoSecao("sige", "sige_relatorios");

  const admin = createAdminClient();
  const [{ data: contasMl }, { data: contasAmazon }, { data: canais }] = await Promise.all([
    admin.from("ml_accounts").select("id, nickname, apelido, cor").order("nickname"),
    admin.from("amazon_accounts").select("id, nickname, apelido, cor").order("nickname"),
    admin.from("canais_manuais").select("id, nome, apelido, cor").eq("ativo", true).order("nome"),
  ]);

  const contas = [
    ...(contasMl ?? []).map((c) => ({ id: `ml:${c.id}`, nome: c.apelido || c.nickname, cor: c.cor ?? "#64748b" })),
    ...(contasAmazon ?? []).map((c) => ({ id: `amazon:${c.id}`, nome: c.apelido || c.nickname, cor: c.cor ?? "#64748b" })),
    ...(canais ?? []).map((c) => ({ id: `manual:${c.id}`, nome: c.apelido || c.nome, cor: c.cor ?? "#64748b" })),
  ];

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">SIGE · Relatórios</h1>
      <p className="mb-6 text-sm text-gray-500">
        Escolha as contas, o período e o tipo de relatório. Mostra o consolidado geral e o detalhamento por conta.
      </p>
      <RelatorioClient contas={contas} podeEditar={podeEditar} />
    </main>
  );
}
