import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { formatarDuracaoMin } from "@/lib/date-utils";
import { definirMetaMesAction, definirMetaAtendimentoAction } from "./actions";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const formatarMoeda = (valor: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);

const METAS_ATENDIMENTO_LABELS: Record<string, string> = {
  sla_mensagens: "SLA de mensagens (tempo máximo de atendimento)",
  sla_perguntas: "SLA de perguntas (tempo máximo de resposta)",
  tempo_reclamacoes: "Tempo de resolução de reclamações (máximo)",
};
const ORDEM_METAS_ATENDIMENTO = ["sla_mensagens", "sla_perguntas", "tempo_reclamacoes"];

export default async function MetasPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>;
}) {
  const { salvo } = await searchParams;
  const { podeEditar } = await exigirAcessoSecao("metas");

  const supabase = await createClient();
  const { data: metasRaw } = await supabase
    .from("metas_mensais")
    .select("ano, mes, valor")
    .order("ano", { ascending: false })
    .order("mes", { ascending: false });

  const metas = (metasRaw ?? []).map((m) => ({
    ano: m.ano as number,
    mes: m.mes as number,
    valor: Number(m.valor),
  }));

  const hoje = new Date();
  const anoAtual = hoje.getFullYear();
  const mesAtual = hoje.getMonth() + 1;
  const metaAtual = metas.find((m) => m.ano === anoAtual && m.mes === mesAtual);

  const { data: metasAtendimentoRaw } = await supabase
    .from("metas_atendimento")
    .select("ano, mes, tipo_meta, valor_minutos")
    .eq("ano", anoAtual)
    .eq("mes", mesAtual);

  const metasAtendimentoAtual = new Map(
    (metasAtendimentoRaw ?? []).map((m) => [m.tipo_meta as string, Number(m.valor_minutos)])
  );

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href="/dashboard" className="text-sm text-[var(--color-sixxis-blue)] underline">
        ← Voltar ao painel
      </Link>
      <h1 className="mt-4 mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">
        Metas mensais
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Defina o valor da meta de faturamento de cada mês. Apenas administradores veem esta página; o
        progresso aparece de forma resumida para todos no Resumo.
      </p>

      {salvo === "1" && (
        <p className="mb-4 rounded bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          Meta salva com sucesso.
        </p>
      )}

      {podeEditar && (
        <form
          action={definirMetaMesAction}
          className="mb-8 flex flex-wrap items-end gap-3 rounded border border-gray-200 bg-white p-4"
        >
          <div>
            <label className="mb-1 block text-xs text-gray-500">Mês</label>
            <select
              name="mes"
              defaultValue={metaAtual?.mes ?? mesAtual}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm"
            >
              {MESES.map((label, i) => (
                <option key={label} value={i + 1}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Ano</label>
            <input
              type="number"
              name="ano"
              defaultValue={metaAtual?.ano ?? anoAtual}
              className="w-24 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Valor da meta (R$)</label>
            <input
              type="number"
              name="valor"
              step="0.01"
              min="0.01"
              defaultValue={metaAtual?.valor ?? ""}
              placeholder="Ex: 1000000"
              className="w-44 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-[var(--color-sixxis-navy)] px-4 py-2 text-sm font-medium text-white"
          >
            Salvar meta
          </button>
        </form>
      )}

      <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Metas cadastradas</h2>
      {metas.length === 0 ? (
        <p className="text-sm text-gray-400">Nenhuma meta definida ainda.</p>
      ) : (
        <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
          {metas.map((m) => (
            <li key={`${m.ano}-${m.mes}`} className="flex items-center justify-between p-3 text-sm">
              <span className="text-gray-700">
                {MESES[m.mes - 1]} de {m.ano}
                {m.ano === anoAtual && m.mes === mesAtual && (
                  <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-600">
                    mês atual
                  </span>
                )}
              </span>
              <span className="font-medium text-gray-900">{formatarMoeda(m.valor)}</span>
            </li>
          ))}
        </ul>
      )}

      <hr className="my-8 border-gray-200" />

      <h2 className="mb-1 text-xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">
        Meta de atendimento
      </h2>
      <p className="mb-6 text-sm text-gray-500">
        Defina o tempo máximo aceitável para cada indicador de SLA do mês atual ({MESES[mesAtual - 1]} de{" "}
        {anoAtual}). O progresso aparece na aba Pós-venda, comparado com a média calculada em tempo real no
        período selecionado ali.
      </p>

      {salvo === "2" && (
        <p className="mb-4 rounded bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          Meta de atendimento salva com sucesso.
        </p>
      )}

      {podeEditar && (
        <form
          action={definirMetaAtendimentoAction}
          className="mb-8 flex flex-col gap-4 rounded border border-gray-200 bg-white p-4"
        >
          <input type="hidden" name="ano" value={anoAtual} />
          <input type="hidden" name="mes" value={mesAtual} />
          {ORDEM_METAS_ATENDIMENTO.map((tipo) => {
            const atual = metasAtendimentoAtual.get(tipo) ?? 0;
            return (
              <div key={tipo} className="flex flex-wrap items-end gap-3">
                <div className="min-w-[220px] flex-1">
                  <label className="mb-1 block text-xs text-gray-500">{METAS_ATENDIMENTO_LABELS[tipo]}</label>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Horas</label>
                  <input
                    type="number"
                    name={`${tipo}_horas`}
                    min="0"
                    defaultValue={Math.floor(atual / 60)}
                    className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Minutos</label>
                  <input
                    type="number"
                    name={`${tipo}_minutos`}
                    min="0"
                    max="59"
                    defaultValue={atual % 60}
                    className="w-20 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
            );
          })}
          <button
            type="submit"
            className="self-start rounded bg-[var(--color-sixxis-navy)] px-4 py-2 text-sm font-medium text-white"
          >
            Salvar metas de atendimento
          </button>
        </form>
      )}

      <ul className="divide-y divide-gray-200 rounded border border-gray-200 bg-white">
        {ORDEM_METAS_ATENDIMENTO.map((tipo) => (
          <li key={tipo} className="flex items-center justify-between p-3 text-sm">
            <span className="text-gray-700">{METAS_ATENDIMENTO_LABELS[tipo]}</span>
            <span className="font-medium text-gray-900">
              {metasAtendimentoAtual.has(tipo) ? formatarDuracaoMin(metasAtendimentoAtual.get(tipo)!) : "Não definida"}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
