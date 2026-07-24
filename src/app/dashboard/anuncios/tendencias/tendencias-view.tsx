"use client";

import { useEffect, useState } from "react";
import {
  buscarCategoriasRaizAction,
  buscarCategoriaAction,
  buscarTendenciasSiteAction,
  buscarTendenciasCategoriaAction,
  pesquisarProdutoAction,
  type ResultadoPesquisaProduto,
} from "./actions";
import type { TermoTendencia } from "@/lib/mercadolivre/tendencias";

type NoCategoria = { id: string; name: string };
type NivelCaminho = { id: string; nome: string; filhas: NoCategoria[] };

function formatarPreco(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ListaTendencias({ lista, destaque }: { lista: TermoTendencia[]; destaque?: string }) {
  if (lista.length === 0) {
    return <p className="text-sm text-gray-400">Sem dados de tendência disponíveis no momento.</p>;
  }
  return (
    <ol className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
      {lista.map((t) => {
        const emDestaque = destaque && t.termo.toLowerCase().includes(destaque.toLowerCase());
        return (
          <li
            key={t.posicao}
            className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
              emDestaque ? "bg-yellow-50 font-medium text-gray-900" : "text-gray-700"
            }`}
          >
            <span className="w-6 shrink-0 text-right text-xs text-gray-400">{t.posicao}º</span>
            <span>{t.termo}</span>
            {emDestaque && <span className="text-xs text-yellow-600">← seu termo</span>}
          </li>
        );
      })}
    </ol>
  );
}

export default function TendenciasView() {
  // --- pesquisa por produto ---
  const [termo, setTermo] = useState("");
  const [pesquisando, setPesquisando] = useState(false);
  const [erroPesquisa, setErroPesquisa] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoPesquisaProduto | null>(null);

  // --- navegacao por categoria ---
  const [caminho, setCaminho] = useState<NivelCaminho[]>([]);
  const [filhasAtuais, setFilhasAtuais] = useState<NoCategoria[]>([]);
  const [carregandoCategorias, setCarregandoCategorias] = useState(true);
  const [erroCategorias, setErroCategorias] = useState<string | null>(null);
  const [categoriaEscolhida, setCategoriaEscolhida] = useState<{ id: string; nome: string } | null>(null);

  // --- tendencias exibidas na secao "explorar" (site inteiro ou categoria) ---
  const [tendencias, setTendencias] = useState<TermoTendencia[]>([]);
  const [carregandoTendencias, setCarregandoTendencias] = useState(true);
  const [erroTendencias, setErroTendencias] = useState<string | null>(null);

  useEffect(() => {
    buscarCategoriasRaizAction()
      .then((raiz) => setFilhasAtuais(raiz))
      .catch((err) => setErroCategorias(err instanceof Error ? err.message : "Erro ao carregar categorias."))
      .finally(() => setCarregandoCategorias(false));

    buscarTendenciasSiteAction()
      .then((lista) => setTendencias(lista))
      .catch((err) => setErroTendencias(err instanceof Error ? err.message : "Erro ao carregar tendências."))
      .finally(() => setCarregandoTendencias(false));
  }, []);

  async function pesquisar() {
    if (termo.trim().length < 3) {
      setErroPesquisa("Digite pelo menos 3 caracteres.");
      return;
    }
    setPesquisando(true);
    setErroPesquisa(null);
    setResultado(null);
    try {
      const r = await pesquisarProdutoAction(termo);
      setResultado(r);
    } catch (err) {
      setErroPesquisa(err instanceof Error ? err.message : "Erro ao pesquisar.");
    } finally {
      setPesquisando(false);
    }
  }

  async function entrarNaCategoria(no: NoCategoria) {
    setCarregandoCategorias(true);
    setErroCategorias(null);
    try {
      const detalhe = await buscarCategoriaAction(no.id);
      setCaminho((atual) => [...atual, { id: no.id, nome: no.name, filhas: filhasAtuais }]);
      if (detalhe.ehFolha) {
        setFilhasAtuais([]);
        await escolherCategoria(detalhe.id, detalhe.nome);
      } else {
        setFilhasAtuais(detalhe.filhas);
      }
    } catch (err) {
      setErroCategorias(err instanceof Error ? err.message : "Erro ao carregar categoria.");
    } finally {
      setCarregandoCategorias(false);
    }
  }

  async function escolherCategoria(id: string, nome: string) {
    setCategoriaEscolhida({ id, nome });
    setCarregandoTendencias(true);
    setErroTendencias(null);
    try {
      const lista = await buscarTendenciasCategoriaAction(id);
      setTendencias(lista);
    } catch (err) {
      setErroTendencias(err instanceof Error ? err.message : "Erro ao carregar tendências da categoria.");
    } finally {
      setCarregandoTendencias(false);
    }
  }

  function voltarNivel(indice: number) {
    const nivel = caminho[indice];
    setFilhasAtuais(nivel.filhas);
    setCaminho((atual) => atual.slice(0, indice));
  }

  async function voltarParaVisaoGeral() {
    setCategoriaEscolhida(null);
    setCaminho([]);
    setCarregandoCategorias(true);
    setCarregandoTendencias(true);
    try {
      const [raiz, lista] = await Promise.all([buscarCategoriasRaizAction(), buscarTendenciasSiteAction()]);
      setFilhasAtuais(raiz);
      setTendencias(lista);
    } catch (err) {
      setErroTendencias(err instanceof Error ? err.message : "Erro ao carregar tendências.");
    } finally {
      setCarregandoCategorias(false);
      setCarregandoTendencias(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Pesquisa por produto */}
      <div className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Pesquisar um produto</h2>
        <div className="mb-3 flex items-center gap-2">
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && pesquisar()}
            placeholder="Ex: detector de metal, climatizador de ar..."
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            onClick={pesquisar}
            disabled={pesquisando}
            className="whitespace-nowrap rounded bg-[var(--color-sixxis-navy)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {pesquisando ? "Pesquisando..." : "Pesquisar"}
          </button>
        </div>

        {erroPesquisa && <p className="mb-2 text-sm text-red-600">{erroPesquisa}</p>}

        {resultado && (
          <div className="space-y-3 border-t border-gray-100 pt-3">
            {resultado.categoriaSugerida ? (
              <p className="text-sm text-gray-600">
                Categoria identificada: <strong>{resultado.categoriaSugerida.nome}</strong>{" "}
                <span className="text-xs text-gray-400">· {resultado.categoriaSugerida.dominio}</span>
              </p>
            ) : (
              <p className="text-sm text-gray-400">Não foi possível identificar uma categoria para esse termo.</p>
            )}

            {resultado.posicaoDoTermo ? (
              <p className="rounded bg-green-50 p-2 text-sm text-green-700">
                🔥 Em alta nesta categoria — posição {resultado.posicaoDoTermo}º de {resultado.tendenciasCategoria.length}.
              </p>
            ) : resultado.categoriaSugerida ? (
              <p className="rounded bg-gray-50 p-2 text-sm text-gray-500">
                Não está no top {resultado.tendenciasCategoria.length || 50} de tendências desta categoria no momento
                (o ML não expõe volume de busca para termos fora do ranking — veja abaixo o cenário competitivo).
              </p>
            ) : null}

            {resultado.competitivo.disponivel ? (
              <div className="grid grid-cols-3 gap-2 rounded bg-gray-50 p-3 text-center text-sm">
                <div>
                  <div className="text-lg font-semibold text-gray-800">{resultado.competitivo.totalAnuncios}</div>
                  <div className="text-xs text-gray-400">anúncios concorrentes</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-800">
                    {formatarPreco(resultado.competitivo.precoMin)}
                  </div>
                  <div className="text-xs text-gray-400">menor preço</div>
                </div>
                <div>
                  <div className="text-lg font-semibold text-gray-800">
                    {formatarPreco(resultado.competitivo.precoMax)}
                  </div>
                  <div className="text-xs text-gray-400">maior preço</div>
                </div>
              </div>
            ) : (
              <p className="rounded bg-gray-50 p-2 text-xs text-gray-400">
                Dados de concorrência (nº de anúncios, faixa de preço) não estão disponíveis: o Mercado Livre restringe
                a busca geral por termo livre a aplicativos parceiros aprovados. As tendências acima continuam
                confiáveis.
              </p>
            )}

            {resultado.tendenciasCategoria.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs text-gray-500">Termos em alta em {resultado.categoriaSugerida?.nome}:</p>
                <ListaTendencias lista={resultado.tendenciasCategoria} destaque={termo} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Explorar por categoria */}
      <div className="rounded border border-gray-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            {categoriaEscolhida ? `Tendências em ${categoriaEscolhida.nome}` : "Tendências gerais da plataforma"}
          </h2>
          {categoriaEscolhida && (
            <button onClick={voltarParaVisaoGeral} className="text-xs text-[var(--color-sixxis-blue)] underline">
              Ver visão geral
            </button>
          )}
        </div>
        <p className="mb-3 text-xs text-gray-400">
          Explore por categoria — inclusive as que você ainda não vende — para entender oportunidades de mercado.
        </p>

        {!categoriaEscolhida && (
          <div className="mb-3 border-b border-gray-100 pb-3">
            <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-gray-500">
              <span className="font-medium text-gray-600">Categorias</span>
              {caminho.map((nivel, i) => (
                <span key={nivel.id} className="flex items-center gap-1">
                  <span>›</span>
                  <button onClick={() => voltarNivel(i + 1)} className="underline hover:text-[var(--color-sixxis-blue)]">
                    {nivel.nome}
                  </button>
                </span>
              ))}
            </div>
            {erroCategorias && <p className="mb-2 text-sm text-red-600">{erroCategorias}</p>}
            {carregandoCategorias ? (
              <p className="text-sm text-gray-400">Carregando...</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {filhasAtuais.map((no) => (
                  <button
                    key={no.id}
                    onClick={() => entrarNaCategoria(no)}
                    className="rounded border border-gray-300 px-3 py-2 text-left text-sm text-gray-700 hover:border-[var(--color-sixxis-navy)] hover:bg-gray-50"
                  >
                    {no.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {erroTendencias && <p className="mb-2 text-sm text-red-600">{erroTendencias}</p>}
        {carregandoTendencias ? (
          <p className="text-sm text-gray-400">Carregando tendências...</p>
        ) : (
          <ListaTendencias lista={tendencias} />
        )}
      </div>
    </div>
  );
}
