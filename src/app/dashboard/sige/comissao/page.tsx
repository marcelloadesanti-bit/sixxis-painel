import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import ComissaoClient from "./comissao-client";

// Metas & Comissao -- calculadora de comissao variavel escalonada, restrita
// ao admin master. NAO usa exigirAcessoSecao/exigirMaster porque essa secao
// nunca deve ficar concedivel via o objeto permissoes JSONB a um
// "administrador" comum -- e sempre e so o master (ver README de seguranca
// em dashboard/configuracoes/actions.ts).
export default async function ComissaoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") redirect("/dashboard");

  const admin = createAdminClient();
  const [{ data: config }, { data: metasMensaisRaw }, { data: snapshotRow }, { data: historicoRaw }] = await Promise.all([
    admin.from("sige_comissao_config").select("pesos, niveis, recebedores").eq("id", 1).maybeSingle(),
    admin.from("metas_mensais").select("ano, mes, valor"),
    admin.from("sige_comissao_snapshot").select("ano, mes, resultado, calculado_em, disparado_por").eq("id", 1).maybeSingle(),
    // Historico de comissao por mes fechado -- gravado automaticamente pelo
    // Fechamento Mensal (ver api/sige/fechamento/route.ts) quando o periodo
    // fechado e exatamente um mes calendario. Puxa o rotulo/periodo do
    // fechamento junto via o relacionamento fechamento_id -> sige_fechamentos.
    admin
      .from("sige_comissao_historico")
      .select("id, meta_total, resultado, calculado_em, sige_fechamentos(rotulo, periodo_de, periodo_ate)")
      .order("calculado_em", { ascending: false }),
  ]);

  const metasMensais = (metasMensaisRaw ?? []).map((m) => ({
    ano: m.ano as number,
    mes: m.mes as number,
    valor: Number(m.valor),
  }));

  const snapshotInicial = snapshotRow
    ? {
        ano: snapshotRow.ano as number,
        mes: snapshotRow.mes as number,
        resultado: snapshotRow.resultado,
        calculadoEm: snapshotRow.calculado_em as string,
        disparadoPor: snapshotRow.disparado_por as "cron" | "manual",
      }
    : null;

  type FechamentoEmbutido = { rotulo: string; periodo_de: string; periodo_ate: string } | null;
  const historico = (historicoRaw ?? [])
    .map((h) => {
      const fechamento = (Array.isArray(h.sige_fechamentos) ? h.sige_fechamentos[0] : h.sige_fechamentos) as FechamentoEmbutido;
      if (!fechamento) return null;
      return {
        id: h.id as string,
        rotulo: fechamento.rotulo,
        periodoDe: fechamento.periodo_de,
        periodoAte: fechamento.periodo_ate,
        metaTotal: Number(h.meta_total),
        resultado: h.resultado,
        calculadoEm: h.calculado_em as string,
      };
    })
    .filter((h): h is NonNullable<typeof h> => h !== null);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">
        SIGE · Metas &amp; Comissão
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Calculadora de comissão variável escalonada por atingimento de meta, por canal (orgânico / pago / Amazon).
        Visível apenas para o administrador master.
      </p>
      <ComissaoClient
        configInicial={config ?? null}
        metasMensais={metasMensais}
        snapshotInicial={snapshotInicial}
        historico={historico}
      />
    </main>
  );
}
