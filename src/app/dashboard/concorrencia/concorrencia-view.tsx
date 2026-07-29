"use client";

import { useEffect, useState } from "react";
import {
  buscarBenchmarksAction,
  listarCategoriasAction,
  buscarMaisVendidosAction,
  type LinhaBenchmark,
  type CategoriaConsolidada,
} from "./actions";
import type { ItemMaisVendido } from "@/lib/mercadolivre/concorrencia";

type Aba = "benchmark" | "mais_vendidos";

function formatarPreco(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const STATUS_INFO: Record<string, { label: string; cor: string }> = {
  with_benchmark_highest: { label: "Muito acima da concorrência", cor: "bg-red-50 text-red-700" },
  with_benchmark_high: { label: "Acima da concorrência", cor: "bg-orange-50 text-orange-700" },
  no_benchmark_ok: { label: "Na média", cor: "bg-gray-100 text-gray-600" },
  no_benchmark_lowest: { label: "Abaixo da concorrência", cor: "bg-green-50 text-green-700" },
  not_optin_applied: { label: "Promoção sugerida não aplicada", cor: "bg-yellow-50 text-yellow-700" },
  promotion_scheduled: { label: "Promoção agendada", cor: "bg-blue-50 text-blue-700" },
  promotion_active: { label: "Promoção ativa", cor: "bg-blue-50 text-blue-700" },
};

function BadgeStatus({ status }: { status: string }) {
  const info = STATUS_INFO[status] ?? { label: status, cor: "bg-gray-100 text-gray-600" };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${info.cor}`}>{info.label}</span>;
}

function AbaBenchmark() {
  const [linhas, setLinhas] = useState<LinhaBenchmark[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    buscarBenchmarksAction()
      .then(setLinhas)
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar benchmark."));
  }, []);

  if (erro) return <p className="text-sm text-red-600">{erro}</p>;
  if (linhas === null) return <p className="text-sm text-gray-400">Carregando benchmark de preço (pode levar alguns segundos)...</p>;
  if (linhas.length === 0) {
    return (
      <p className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400 dark:border-gray-600">
        Nenhum anúncio com referência de preço calculada pelo Mercado Livre no momento. O ML só gera essa
        referência quando há concorrência comparável suficiente para o item.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400">
        Dado oficial do Mercado Livre (referências de preço): {linhas.length} anúncio{linhas.length === 1 ? "" : "s"}{" "}
        com benchmark disponível, ordenados por prioridade de ação.
      </p>
      {linhas.map((l) => (
        <div key={`${l.contaId}-${l.itemId}`} className="rounded border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-start gap-3">
            {l.thumbnail && (
              <img src={l.thumbnail} alt="" className="h-14 w-14 shrink-0 rounded border border-gray-100 object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: l.contaCor }}
                >
                  {l.contaNickname}
                </span>
                <BadgeStatus status={l.status} />
              </div>
              <a
                href={l.permalink || undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="line-clamp-1 text-sm font-medium text-gray-800 hover:underline dark:text-gray-100"
              >
                {l.titulo}
              </a>
              <div className="mt-1 flex flex-wrap gap-4 text-xs text-gray-500">
                <span>
                  Nosso preço: <strong className="text-gray-700 dark:text-gray-200">{formatarPreco(l.precoAtual)}</strong>
                </span>
                <span>
                  Preço sugerido: <strong className="text-gray-700 dark:text-gray-200">{formatarPreco(l.precoSugerido)}</strong>
                </span>
                {l.diferencaPercentual !== null && (
                  <span>
                    Diferença: <strong className="text-gray-700 dark:text-gray-200">{l.diferencaPercentual.toFixed(1)}%</strong>
                  </span>
                )}
              </div>
              {l.comparaveis.length > 0 && (
                <button
                  onClick={() => setExpandido(expandido === l.itemId ? null : l.itemId)}
                  className="mt-1 text-xs text-[var(--color-sixxis-blue)] underline"
                >
                  {expandido === l.itemId ? "Ocultar" : "Ver"} {l.comparaveis.length} item(ns) comparável(is)
                </button>
              )}
              {expandido === l.itemId && (
                <ul className="mt-2 space-y-1 border-t border-gray-100 pt-2 dark:border-gray-700">
                  {l.comparaveis.map((c, i) => (
                    <li key={i} className="flex justify-between text-xs text-gray-500">
                      <span className="truncate pr-2">{c.titulo}</span>
                      <span className="shrink-0">
                        {formatarPreco(c.preco)} · {c.vendidos} vendidos
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TipoBadge({ tipo }: { tipo: string }) {
  const label = tipo === "PRODUCT" ? "Catálogo" : tipo === "USER_PRODUCT" ? "Vendedor" : "Anúncio";
  return <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-300">{label}</span>;
}

function AbaMaisVendidos() {
  const [categorias, setCategorias] = useState<CategoriaConsolidada[] | null>(null);
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [itens, setItens] = useState<ItemMaisVendido[] | null>(null);
  const [carregandoItens, setCarregandoItens] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    listarCategoriasAction()
      .then((lista) => {
        setCategorias(lista);
        if (lista.length > 0) setCategoriaId(lista[0].categoriaId);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar categorias."));
  }, []);

  useEffect(() => {
    if (!categoriaId) return;
    setCarregandoItens(true);
    setErro(null);
    buscarMaisVendidosAction(categoriaId)
      .then(setItens)
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar ranking."))
      .finally(() => setCarregandoItens(false));
  }, [categoriaId]);

  if (categorias === null) return <p className="text-sm text-gray-400">Carregando categorias...</p>;
  if (categorias.length === 0) {
    return (
      <p className="rounded border border-dashed border-gray-300 p-4 text-sm text-gray-400 dark:border-gray-600">
        Nenhuma categoria identificada nos anúncios ativos das contas conectadas.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-gray-500">Categoria (das que você vende hoje)</label>
        <select
          value={categoriaId}
          onChange={(e) => setCategoriaId(e.target.value)}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 sm:w-96"
        >
          {categorias.map((c) => (
            <option key={c.categoriaId} value={c.categoriaId}>
              {c.categoriaNome} ({c.quantidadeAnuncios} anúncio{c.quantidadeAnuncios === 1 ? "" : "s"} nosso{c.quantidadeAnuncios === 1 ? "" : "s"})
            </option>
          ))}
        </select>
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {carregandoItens && <p className="text-sm text-gray-400">Carregando ranking...</p>}

      {!carregandoItens && itens && itens.length === 0 && (
        <p className="text-sm text-gray-400">Nenhum dado de mais vendidos disponível para esta categoria.</p>
      )}

      {!carregandoItens && itens && itens.length > 0 && (
        <ol className="space-y-1.5">
          {itens.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-3 rounded border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800"
            >
              <span className="w-6 shrink-0 text-right text-sm font-semibold text-gray-400">{it.posicao}º</span>
              {it.imagem ? (
                <img src={it.imagem} alt="" className="h-10 w-10 shrink-0 rounded border border-gray-100 object-cover" />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded bg-gray-100 dark:bg-gray-700" />
              )}
              <span className="min-w-0 flex-1 truncate text-sm text-gray-700 dark:text-gray-200">
                {it.titulo ?? it.id}
              </span>
              <TipoBadge tipo={it.tipo} />
            </li>
          ))}
        </ol>
      )}
      <p className="text-xs text-gray-400">
        Ranking oficial do Mercado Livre (mesmo dado da aba "Análise de mercado" do próprio ML). Itens do tipo
        "Vendedor" e "Anúncio" não são enriquecidos com nome/imagem aqui, pois pertencem a outros vendedores.
      </p>
    </div>
  );
}

export default function ConcorrenciaView() {
  const [aba, setAba] = useState<Aba>("benchmark");

  return (
    <div>
      <div className="mb-4 flex gap-1 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setAba("benchmark")}
          className={`px-3 py-2 text-sm font-medium ${
            aba === "benchmark"
              ? "border-b-2 border-[var(--color-sixxis-navy)] text-[var(--color-sixxis-navy)] dark:text-white"
              : "text-gray-500"
          }`}
        >
          Benchmark de Preço
        </button>
        <button
          onClick={() => setAba("mais_vendidos")}
          className={`px-3 py-2 text-sm font-medium ${
            aba === "mais_vendidos"
              ? "border-b-2 border-[var(--color-sixxis-navy)] text-[var(--color-sixxis-navy)] dark:text-white"
              : "text-gray-500"
          }`}
        >
          Mais Vendidos por Categoria
        </button>
      </div>

      {aba === "benchmark" ? <AbaBenchmark /> : <AbaMaisVendidos />}
    </div>
  );
}
