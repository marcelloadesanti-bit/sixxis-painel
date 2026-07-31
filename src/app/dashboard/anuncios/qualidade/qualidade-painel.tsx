"use client";

import { useRouter, useSearchParams } from "next/navigation";
import type { ConsolidadoQualidade, QualidadeAnuncio } from "@/lib/mercadolivre/qualidade";
import { consultarScoreAction, verificarLoteAction } from "./actions";

export type ContaQualidade = {
  id: string;
  mlUserId: string;
  nickname: string;
  cor: string;
  consolidado: ConsolidadoQualidade;
};

export type ItemExpandido = {
  id: string;
  titulo: string;
  thumbnail: string;
  qualidade: QualidadeAnuncio | null;
};

function corNivel(nivel: string | null): string {
  if (!nivel) return "bg-gray-100 text-gray-500";
  const n = nivel.toLowerCase();
  if (n.includes("profis") || n.includes("professional") || n.includes("good")) return "bg-green-50 text-green-700";
  if (n.includes("satisf") || n.includes("standard") || n.includes("estand") || n.includes("medium"))
    return "bg-yellow-50 text-yellow-700";
  return "bg-red-50 text-red-600";
}

function corScore(score: number | null): string {
  if (score === null) return "text-gray-400";
  if (score >= 70) return "text-green-700";
  if (score >= 40) return "text-yellow-700";
  return "text-red-600";
}

const MOTIVOS_CATALOGO: Record<string, string> = {
  non_trusted_seller: "Vendedor não confiável para o catálogo",
  reputation_below_threshold: "Reputação abaixo do necessário para ganhar",
  item_reputation_below_threshold: "Reputação do anúncio abaixo do necessário",
  winner_has_better_reputation: "O concorrente vencedor tem reputação melhor",
  manufacturing_time: "Anúncio com prazo de fabricação (perde para quem tem estoque imediato)",
  temporarily_winning_manufacturing_time: "Ganhando temporariamente (prazo de fabricação)",
  temporarily_competing_manufacturing_time: "Competindo temporariamente (prazo de fabricação)",
  temporarily_winning_best_reputation_available: "Ganhando temporariamente (melhor reputação disponível)",
  temporarily_competing_best_reputation_available: "Competindo temporariamente (melhor reputação disponível)",
  item_paused: "Anúncio pausado",
  item_not_opted_in: "Anúncio não participa do catálogo",
  shipping_mode: "Modalidade de frete inferior à do vencedor",
  newbie_program_seller: "Limite do programa de novos vendedores atingido",
};

function labelStatusCatalogo(status: string | null): { label: string; cor: string } | null {
  if (!status) return null;
  if (status === "winning") return { label: "Ganhando o catálogo", cor: "bg-green-50 text-green-700" };
  if (status === "sharing_first_place") return { label: "Dividindo 1º lugar", cor: "bg-yellow-50 text-yellow-700" };
  if (status === "competing") return { label: "Perdendo (competindo)", cor: "bg-red-50 text-red-600" };
  if (status === "listed") return { label: "Fora da disputa", cor: "bg-gray-100 text-gray-500" };
  return null;
}

function formatarMoeda(valor: number | null) {
  if (valor === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor);
}

export default function QualidadePainel({
  todasContas,
  contasSelecionadas,
  contas,
  consolidadoGeral,
  contaExpandida,
  itensExpandidos,
  erroExpandir,
}: {
  todasContas: { id: string; nickname: string; cor: string }[];
  contasSelecionadas: string[];
  contas: ContaQualidade[];
  consolidadoGeral: ConsolidadoQualidade;
  contaExpandida: string | null;
  itensExpandidos: ItemExpandido[];
  erroExpandir: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const todasMarcadas = contasSelecionadas.length === todasContas.length;

  function atualizarContas(ids: string[]) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("contas", ids.join(","));
    params.delete("expandir");
    router.push(`/dashboard/anuncios/qualidade?${params.toString()}`);
  }

  function alternarConta(contaId: string) {
    const atual = new Set(contasSelecionadas);
    if (atual.has(contaId)) atual.delete(contaId);
    else atual.add(contaId);
    atualizarContas(atual.size > 0 ? Array.from(atual) : todasContas.map((c) => c.id));
  }

  function alternarExpandir(contaId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (contaExpandida === contaId) {
      params.delete("expandir");
    } else {
      params.set("expandir", contaId);
    }
    router.push(`/dashboard/anuncios/qualidade?${params.toString()}`);
  }

  return (
    <div>
      {/* Filtro pilula de contas -- mesmo padrao das demais paginas */}
      {todasContas.length > 1 && (
        <div className="mb-6 flex flex-wrap items-center gap-2 rounded border border-gray-200 bg-white p-4">
          <span className="text-xs font-medium uppercase text-gray-400">Contas</span>
          <button
            onClick={() => atualizarContas(todasContas.map((c) => c.id))}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              todasMarcadas
                ? "bg-[var(--color-sixxis-navy)] text-white"
                : "border border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            Consolidado (todas)
          </button>
          {todasContas.map((c) => {
            const marcado = contasSelecionadas.includes(c.id);
            return (
              <label
                key={c.id}
                className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700"
              >
                <input type="checkbox" checked={marcado} onChange={() => alternarConta(c.id)} />
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.cor }} />
                {c.nickname}
              </label>
            );
          })}
        </div>
      )}

      {/* Card grande: consolidado geral */}
      <div className="mb-6 rounded border border-gray-200 bg-white p-6">
        <p className="mb-4 text-sm font-semibold text-gray-700">Consolidado geral</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase text-gray-400">Score médio</p>
            <p className={`text-2xl font-bold ${corScore(consolidadoGeral.mediaScore)}`}>
              {consolidadoGeral.mediaScore ?? "—"}
              {consolidadoGeral.mediaScore !== null && <span className="text-sm font-normal text-gray-400">/100</span>}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-400">Verificados</p>
            <p className="text-2xl font-bold text-gray-900">
              {consolidadoGeral.verificados}
              <span className="text-sm font-normal text-gray-400"> de {consolidadoGeral.ativos}</span>
            </p>
          </div>
          <div className="col-span-2 sm:col-span-2">
            <p className="mb-1 text-xs uppercase text-gray-400">Distribuição por nível</p>
            <div className="flex flex-wrap gap-2">
              {consolidadoGeral.distribuicao.length === 0 && <span className="text-sm text-gray-400">—</span>}
              {consolidadoGeral.distribuicao.map((d) => (
                <span key={d.nivel} className={`rounded-full px-2 py-1 text-xs font-medium ${corNivel(d.nivel)}`}>
                  {d.nivel}: {d.quantidade}
                </span>
              ))}
            </div>
          </div>
        </div>

        {consolidadoGeral.piores.length > 0 && (
          <div className="mt-5 border-t border-gray-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase text-gray-400">
              Anúncios com pior qualidade (já verificados)
            </p>
            <ul className="flex flex-col gap-2">
              {consolidadoGeral.piores.slice(0, 5).map((p) => (
                <li key={p.itemId} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">
                    {p.itemId}
                    {p.pendencias[0] && <span className="ml-2 text-xs text-gray-400">{p.pendencias[0].title}</span>}
                  </span>
                  <span className={`font-semibold ${corScore(p.score)}`}>{p.score}/100</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Accordion por conta */}
      <div className="flex flex-col gap-3">
        {contas.map((conta) => {
          const aberta = contaExpandida === conta.id;
          return (
            <div key={conta.id} className="rounded border border-gray-200 bg-white">
              <button
                onClick={() => alternarExpandir(conta.id)}
                className="flex w-full items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: conta.cor }} />
                  <span className="text-sm font-semibold text-gray-800">{conta.nickname}</span>
                  <span className="text-xs text-gray-400">
                    {conta.consolidado.verificados} de {conta.consolidado.ativos} verificados
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold ${corScore(conta.consolidado.mediaScore)}`}>
                    {conta.consolidado.mediaScore ?? "—"}
                    {conta.consolidado.mediaScore !== null && <span className="text-xs font-normal text-gray-400">/100</span>}
                  </span>
                  <span className="text-xs text-gray-400">{aberta ? "Recolher ▴" : "Expandir ▾"}</span>
                </div>
              </button>

              {aberta && (
                <div className="border-t border-gray-100 px-5 py-4">
                  <form action={verificarLoteAction} className="mb-4">
                    <input type="hidden" name="contaId" value={conta.id} />
                    <input type="hidden" name="sellerId" value={conta.mlUserId} />
                    <input type="hidden" name="contas" value={contasSelecionadas.join(",")} />
                    <input type="hidden" name="expandir" value={conta.id} />
                    <button
                      type="submit"
                      className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Verificar mais 20
                    </button>
                    <span className="ml-2 text-xs text-gray-400">
                      Consulta somente anúncios ativos ainda não verificados.
                    </span>
                  </form>

                  {erroExpandir && <p className="mb-3 text-sm text-red-600">{erroExpandir}</p>}

                  {itensExpandidos.length === 0 && !erroExpandir && (
                    <p className="text-sm text-gray-400">Nenhum anúncio ativo encontrado.</p>
                  )}

                  <ul className="flex flex-col divide-y divide-gray-100">
                    {itensExpandidos.map((item) => {
                      const q = item.qualidade;
                      const statusCatalogo = labelStatusCatalogo(q?.catalogoStatus ?? null);
                      return (
                        <li key={item.id} className="flex items-center gap-3 py-3">
                          {item.thumbnail && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-gray-800">{item.titulo}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              {q ? (
                                <>
                                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${corNivel(q.nivel)}`}>
                                    {q.nivel ?? "—"} · {q.score ?? "—"}/100
                                  </span>
                                  {statusCatalogo && (
                                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCatalogo.cor}`}>
                                      {statusCatalogo.label}
                                      {q.catalogoStatus !== "winning" && q.catalogoPriceToWin !== null
                                        ? ` · preço p/ ganhar: ${formatarMoeda(q.catalogoPriceToWin)}`
                                        : ""}
                                    </span>
                                  )}
                                  {q.pendencias.slice(0, 2).map((p) => (
                                    <span key={p.key} className="text-xs text-gray-400">
                                      {p.title}
                                    </span>
                                  ))}
                                </>
                              ) : (
                                <span className="text-xs text-gray-400">Ainda não verificado</span>
                              )}
                            </div>
                          </div>
                          <form action={consultarScoreAction}>
                            <input type="hidden" name="itemId" value={item.id} />
                            <input type="hidden" name="contaId" value={conta.id} />
                            <input type="hidden" name="contas" value={contasSelecionadas.join(",")} />
                            <input type="hidden" name="expandir" value={conta.id} />
                            <button
                              type="submit"
                              className="shrink-0 rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                            >
                              {q ? "Consultar de novo" : "Consultar score"}
                            </button>
                          </form>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
