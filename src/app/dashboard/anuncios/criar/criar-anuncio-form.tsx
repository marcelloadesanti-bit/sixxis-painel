"use client";

import { useState } from "react";
import {
  buscarCategoriasRaizAction,
  buscarCategoriaAction,
  buscarAtributosAction,
  predizerCategoriaAction,
  criarAnuncioAction,
  type ResultadoContaCriacao,
} from "./actions";
import type { AtributoCategoria, SugestaoCategoria } from "@/lib/mercadolivre/categorias";

type ContaOpcao = { id: string; nickname: string; cor: string };
type NoCategoria = { id: string; name: string };
type NivelCaminho = { id: string; nome: string; filhas: NoCategoria[] };

export default function CriarAnuncioForm({ contas }: { contas: ContaOpcao[] }) {
  // --- titulo + predicao automatica de categoria ---
  const [titulo, setTitulo] = useState("");
  const [sugestoes, setSugestoes] = useState<SugestaoCategoria[] | null>(null);
  const [buscandoSugestoes, setBuscandoSugestoes] = useState(false);
  const [erroSugestoes, setErroSugestoes] = useState<string | null>(null);

  // --- busca manual (fallback) na arvore de categorias ---
  const [buscaManual, setBuscaManual] = useState(false);
  const [caminho, setCaminho] = useState<NivelCaminho[]>([]);
  const [filhasAtuais, setFilhasAtuais] = useState<NoCategoria[]>([]);
  const [carregandoCategorias, setCarregandoCategorias] = useState(false);
  const [erroCategorias, setErroCategorias] = useState<string | null>(null);

  // --- categoria final escolhida ---
  const [categoriaFinal, setCategoriaFinal] = useState<{ id: string; nome: string } | null>(null);
  const [atributos, setAtributos] = useState<AtributoCategoria[]>([]);
  const [carregandoAtributos, setCarregandoAtributos] = useState(false);
  const [valoresAtributos, setValoresAtributos] = useState<Record<string, string>>({});

  // --- campos do anuncio ---
  const [preco, setPreco] = useState("");
  const [estoque, setEstoque] = useState("");
  const [descricao, setDescricao] = useState("");
  const [freteGratis, setFreteGratis] = useState(false);
  const [imagens, setImagens] = useState<File[]>([]);
  const [contasSelecionadas, setContasSelecionadas] = useState<string[]>(contas.map((c) => c.id));

  // --- envio ---
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ResultadoContaCriacao[] | null>(null);

  async function buscarSugestoes() {
    if (titulo.trim().length < 4) {
      setErroSugestoes("Digite pelo menos 4 caracteres do título.");
      return;
    }
    setBuscandoSugestoes(true);
    setErroSugestoes(null);
    try {
      const lista = await predizerCategoriaAction(titulo);
      setSugestoes(lista);
      if (lista.length === 0) setErroSugestoes("Nenhuma categoria encontrada para esse título. Tente reformular ou busque manualmente abaixo.");
    } catch (err) {
      setErroSugestoes(err instanceof Error ? err.message : "Erro ao buscar categoria.");
    } finally {
      setBuscandoSugestoes(false);
    }
  }

  async function escolherCategoriaFinal(id: string, nome: string) {
    setCategoriaFinal({ id, nome });
    setCarregandoAtributos(true);
    try {
      const attrs = await buscarAtributosAction(id);
      setAtributos(attrs);
    } catch (err) {
      setErroCategorias(err instanceof Error ? err.message : "Erro ao carregar campos da categoria.");
    } finally {
      setCarregandoAtributos(false);
    }
  }

  function ativarBuscaManual() {
    setBuscaManual(true);
    setErroCategorias(null);
    setCarregandoCategorias(true);
    buscarCategoriasRaizAction()
      .then((raiz) => setFilhasAtuais(raiz))
      .catch((err) => setErroCategorias(err instanceof Error ? err.message : "Erro ao carregar categorias."))
      .finally(() => setCarregandoCategorias(false));
  }

  async function entrarNaCategoria(no: NoCategoria) {
    setCarregandoCategorias(true);
    setErroCategorias(null);
    try {
      const detalhe = await buscarCategoriaAction(no.id);
      setCaminho((atual) => [...atual, { id: no.id, nome: no.name, filhas: filhasAtuais }]);
      if (detalhe.ehFolha) {
        setFilhasAtuais([]);
        await escolherCategoriaFinal(detalhe.id, detalhe.nome);
      } else {
        setFilhasAtuais(detalhe.filhas);
      }
    } catch (err) {
      setErroCategorias(err instanceof Error ? err.message : "Erro ao carregar categoria.");
    } finally {
      setCarregandoCategorias(false);
    }
  }

  function voltarNivel(indice: number) {
    const nivel = caminho[indice];
    setFilhasAtuais(nivel.filhas);
    setCaminho((atual) => atual.slice(0, indice));
  }

  function trocarCategoria() {
    setCategoriaFinal(null);
    setAtributos([]);
    setValoresAtributos({});
    setSugestoes(null);
    setErroSugestoes(null);
    setBuscaManual(false);
    setCaminho([]);
    setFilhasAtuais([]);
  }

  function alternarConta(id: string) {
    setContasSelecionadas((atual) =>
      atual.includes(id) ? atual.filter((c) => c !== id) : [...atual, id]
    );
  }

  async function enviar() {
    setErroEnvio(null);

    if (!categoriaFinal) return setErroEnvio("Escolha uma categoria.");
    if (!titulo.trim()) return setErroEnvio("Informe o título do anúncio.");
    if (!preco || Number(preco) <= 0) return setErroEnvio("Informe um preço válido.");
    if (!estoque || Number(estoque) < 0) return setErroEnvio("Informe o estoque.");
    if (imagens.length === 0) return setErroEnvio("Adicione ao menos uma foto.");
    if (contasSelecionadas.length === 0) return setErroEnvio("Selecione ao menos uma conta.");

    const faltando = atributos.filter((a) => !valoresAtributos[a.id]?.trim());
    if (faltando.length > 0) {
      return setErroEnvio(`Preencha os campos obrigatórios: ${faltando.map((a) => a.nome).join(", ")}.`);
    }

    const fd = new FormData();
    fd.set("titulo", titulo.trim());
    fd.set("categoriaId", categoriaFinal.id);
    fd.set("preco", preco);
    fd.set("estoque", estoque);
    fd.set("descricao", descricao);
    if (freteGratis) fd.set("freteGratis", "on");
    fd.set("contaIds", contasSelecionadas.join(","));
    fd.set(
      "atributosJson",
      JSON.stringify(
        atributos.map((a) =>
          a.valores
            ? { id: a.id, value_id: valoresAtributos[a.id] }
            : { id: a.id, value_name: valoresAtributos[a.id] }
        )
      )
    );
    for (const img of imagens) fd.append("imagens", img);

    setEnviando(true);
    try {
      const resultado = await criarAnuncioAction(fd);
      setResultados(resultado.resultados);
    } catch (err) {
      setErroEnvio(err instanceof Error ? err.message : "Erro ao criar anúncio.");
    } finally {
      setEnviando(false);
    }
  }

  // --- tela de resultado, depois do envio ---
  if (resultados) {
    return (
      <div className="rounded border border-gray-200 bg-white p-6">
        <h2 className="mb-4 text-lg font-semibold text-[var(--color-sixxis-navy)]">Resultado da publicação</h2>
        <div className="space-y-2">
          {resultados.map((r) => (
            <div
              key={r.contaId}
              className={`flex items-center justify-between rounded p-3 text-sm ${
                r.ok ? "bg-green-50" : "bg-red-50"
              }`}
            >
              <span className="font-medium text-gray-800">{r.contaNickname}</span>
              {r.ok ? (
                <a
                  href={`/dashboard/anuncios/gestao/${r.itemId}?conta=${r.contaId}`}
                  className="text-[var(--color-sixxis-blue)] underline"
                >
                  Publicado ({r.itemId}) — abrir e revisar →
                </a>
              ) : (
                <span className="text-red-600">Falhou: {r.erro}</span>
              )}
            </div>
          ))}
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-6 rounded bg-[var(--color-sixxis-navy)] px-4 py-2 text-sm font-medium text-white"
        >
          Criar outro anúncio
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Titulo + categoria */}
      <div className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">1. Título e categoria</h2>
        <label className="mb-1 block text-xs text-gray-500">Título do anúncio (máx. 60 caracteres)</label>
        <div className="mb-3 flex items-center gap-2">
          <input
            value={titulo}
            onChange={(e) => setTitulo(e.target.value.slice(0, 60))}
            maxLength={60}
            placeholder="Ex: Climatizador de ar portátil 45L residencial 110v"
            disabled={Boolean(categoriaFinal)}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
          />
          {!categoriaFinal && (
            <button
              onClick={buscarSugestoes}
              disabled={buscandoSugestoes}
              className="whitespace-nowrap rounded bg-[var(--color-sixxis-navy)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {buscandoSugestoes ? "Buscando..." : "Buscar categoria"}
            </button>
          )}
        </div>

        {categoriaFinal ? (
          <div className="flex items-center justify-between rounded bg-green-50 p-3 text-sm">
            <span>
              Categoria escolhida: <strong>{categoriaFinal.nome}</strong>
            </span>
            <button onClick={trocarCategoria} className="text-xs text-[var(--color-sixxis-blue)] underline">
              Trocar
            </button>
          </div>
        ) : (
          <>
            {erroSugestoes && <p className="mb-2 text-sm text-red-600">{erroSugestoes}</p>}

            {sugestoes && sugestoes.length > 0 && (
              <div className="mb-3">
                <p className="mb-1 text-xs text-gray-500">Categorias sugeridas para esse título:</p>
                <div className="flex flex-wrap gap-2">
                  {sugestoes.map((s) => (
                    <button
                      key={s.categoriaId}
                      onClick={() => escolherCategoriaFinal(s.categoriaId, s.categoriaNome)}
                      className="rounded-full border border-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-[var(--color-sixxis-navy)] hover:bg-[var(--color-sixxis-navy)] hover:text-white"
                    >
                      {s.categoriaNome} <span className="opacity-60">· {s.dominioNome}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!buscaManual ? (
              <button onClick={ativarBuscaManual} className="text-xs text-gray-500 underline hover:text-[var(--color-sixxis-blue)]">
                Não encontrou a categoria certa? Buscar manualmente na árvore
              </button>
            ) : (
              <div className="mt-2 border-t border-gray-100 pt-3">
                <div className="mb-2 flex flex-wrap items-center gap-1 text-xs text-gray-500">
                  <button onClick={ativarBuscaManual} className="underline hover:text-[var(--color-sixxis-blue)]">
                    Categorias
                  </button>
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
          </>
        )}
      </div>

      {/* Atributos obrigatorios da categoria */}
      {categoriaFinal && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">2. Campos obrigatórios da categoria</h2>
          {carregandoAtributos ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : atributos.length === 0 ? (
            <p className="text-sm text-gray-400">Esta categoria não exige campos adicionais.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {atributos.map((a) => (
                <div key={a.id}>
                  <label className="mb-1 block text-xs text-gray-500">
                    {a.nome} <span className="text-red-500">*</span>
                  </label>
                  {a.valores ? (
                    <select
                      value={valoresAtributos[a.id] ?? ""}
                      onChange={(e) => setValoresAtributos((v) => ({ ...v, [a.id]: e.target.value }))}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">Selecione...</option>
                      {a.valores.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.nome}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={valoresAtributos[a.id] ?? ""}
                      onChange={(e) => setValoresAtributos((v) => ({ ...v, [a.id]: e.target.value }))}
                      placeholder={a.dica ?? ""}
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dados basicos */}
      {categoriaFinal && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">3. Dados do anúncio</h2>
          <div className="mb-3 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Preço (R$)</label>
              <input
                type="number"
                step="0.01"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Estoque</label>
              <input
                type="number"
                value={estoque}
                onChange={(e) => setEstoque(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mb-3">
            <label className="mb-1 block text-xs text-gray-500">Descrição</label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={4}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <label className="mb-3 flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={freteGratis} onChange={(e) => setFreteGratis(e.target.checked)} />
            Frete grátis
          </label>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Fotos</label>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setImagens(Array.from(e.target.files ?? []))}
              className="block w-full text-sm"
            />
            {imagens.length > 0 && (
              <p className="mt-1 text-xs text-gray-400">{imagens.length} foto(s) selecionada(s)</p>
            )}
          </div>
        </div>
      )}

      {/* Contas */}
      {categoriaFinal && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">4. Publicar nas contas</h2>
          <p className="mb-3 text-xs text-gray-500">
            O mesmo anúncio (título, fotos, categoria, preço e estoque) será criado em cada conta selecionada.
          </p>
          <div className="flex flex-wrap gap-2">
            {contas.map((c) => (
              <label
                key={c.id}
                className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={contasSelecionadas.includes(c.id)}
                  onChange={() => alternarConta(c.id)}
                />
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.cor }} />
                {c.nickname}
              </label>
            ))}
          </div>
        </div>
      )}

      {categoriaFinal && (
        <div>
          {erroEnvio && <p className="mb-3 rounded bg-red-50 p-3 text-sm text-red-600">{erroEnvio}</p>}
          <button
            onClick={enviar}
            disabled={enviando}
            className="rounded bg-[var(--color-sixxis-navy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {enviando ? "Publicando..." : "Publicar anúncio"}
          </button>
        </div>
      )}
    </div>
  );
}
