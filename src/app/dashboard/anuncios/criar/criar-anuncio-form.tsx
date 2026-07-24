"use client";

import { useState } from "react";
import {
  buscarCategoriasRaizAction,
  buscarCategoriaAction,
  buscarAtributosAction,
  predizerCategoriaAction,
  buscarTiposAnuncioAction,
  buscarTendenciasCategoriaAction,
  criarAnuncioAction,
  type ResultadoContaCriacao,
} from "./actions";
import type { AtributoCategoria, SugestaoCategoria, TipoAnuncio } from "@/lib/mercadolivre/categorias";
import type { TermoTendencia } from "@/lib/mercadolivre/tendencias";
import SeletorFotos from "./seletor-fotos";

type ContaOpcao = { id: string; nickname: string; cor: string };
type NoCategoria = { id: string; name: string };
type NivelCaminho = { id: string; nome: string; filhas: NoCategoria[] };

type LinhaVariacao = {
  valorId?: string;
  valorNome: string;
  estoque: string;
  sku: string;
  gtin: string;
  imagens: File[];
};

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
  const [naoSeAplica, setNaoSeAplica] = useState<Record<string, boolean>>({});
  const [tendenciasCategoria, setTendenciasCategoria] = useState<TermoTendencia[]>([]);

  // --- variacoes ---
  const [temVariacoes, setTemVariacoes] = useState(false);
  const [atributoVariacaoId, setAtributoVariacaoId] = useState("");
  const [linhasVariacao, setLinhasVariacao] = useState<LinhaVariacao[]>([]);
  const [novoValorVariacao, setNovoValorVariacao] = useState("");

  // --- preco + tipo de anuncio ---
  const [preco, setPreco] = useState("");
  const [tiposAnuncio, setTiposAnuncio] = useState<TipoAnuncio[] | null>(null);
  const [tipoAnuncioEscolhido, setTipoAnuncioEscolhido] = useState("");
  const [carregandoTipos, setCarregandoTipos] = useState(false);
  const [erroTipos, setErroTipos] = useState<string | null>(null);
  const [freteGratis, setFreteGratis] = useState(false);

  // --- dados sem variacao ---
  const [estoque, setEstoque] = useState("");
  const [sku, setSku] = useState("");
  const [gtin, setGtin] = useState("");
  const [semGtin, setSemGtin] = useState(false);
  const [imagens, setImagens] = useState<File[]>([]);
  const [embalagem, setEmbalagem] = useState({ largura: "", comprimento: "", altura: "", peso: "" });

  const [descricao, setDescricao] = useState("");
  const [contasSelecionadas, setContasSelecionadas] = useState<string[]>(contas.map((c) => c.id));

  // --- envio ---
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [resultados, setResultados] = useState<ResultadoContaCriacao[] | null>(null);

  const atributosPrincipais = atributos.filter((a) => a.grupo === "principal");
  const atributosSecundarios = atributos.filter(
    (a) => a.grupo === "secundaria" && !a.podeVariar && !a.embalagem
  );
  const atributosVariacao = atributos.filter((a) => a.podeVariar);
  const atributosEmbalagem = atributos.filter((a) => a.embalagem);
  const atributoVariacaoEscolhido = atributosVariacao.find((a) => a.id === atributoVariacaoId) ?? null;

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
    // termos em alta: nao bloqueia o formulario se essa chamada falhar
    buscarTendenciasCategoriaAction(id)
      .then((lista) => setTendenciasCategoria(lista))
      .catch(() => setTendenciasCategoria([]));
  }

  function inserirTermoNoTitulo(termo: string) {
    setTitulo((atual) => {
      if (atual.toLowerCase().includes(termo.toLowerCase())) return atual;
      const combinado = atual ? `${atual} ${termo}` : termo;
      return combinado.slice(0, 60);
    });
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
    setNaoSeAplica({});
    setSugestoes(null);
    setErroSugestoes(null);
    setBuscaManual(false);
    setCaminho([]);
    setFilhasAtuais([]);
    setTendenciasCategoria([]);
    setEmbalagem({ largura: "", comprimento: "", altura: "", peso: "" });
    setTemVariacoes(false);
    setAtributoVariacaoId("");
    setLinhasVariacao([]);
    setTiposAnuncio(null);
    setTipoAnuncioEscolhido("");
  }

  function alternarConta(id: string) {
    setContasSelecionadas((atual) =>
      atual.includes(id) ? atual.filter((c) => c !== id) : [...atual, id]
    );
  }

  async function calcularTarifas() {
    if (!categoriaFinal || !preco || Number(preco) <= 0) {
      setErroTipos("Informe um preço válido antes de calcular as tarifas.");
      return;
    }
    setCarregandoTipos(true);
    setErroTipos(null);
    try {
      const tipos = await buscarTiposAnuncioAction(categoriaFinal.id, Number(preco));
      setTiposAnuncio(tipos);
      if (tipos.length > 0) {
        const premium = tipos.find((t) => t.id === "gold_pro");
        setTipoAnuncioEscolhido((atual) => (tipos.some((t) => t.id === atual) ? atual : (premium ?? tipos[0]).id));
      } else {
        setErroTipos("Não há tipos de anúncio disponíveis para essa categoria/preço.");
      }
    } catch (err) {
      setErroTipos(err instanceof Error ? err.message : "Erro ao calcular tarifas.");
    } finally {
      setCarregandoTipos(false);
    }
  }

  function adicionarValorVariacao() {
    if (!atributoVariacaoEscolhido) return;
    const usaLista = Boolean(atributoVariacaoEscolhido.valores);
    if (!novoValorVariacao) return;

    let valorId: string | undefined;
    let valorNome: string;
    if (usaLista) {
      const opt = atributoVariacaoEscolhido.valores!.find((v) => v.id === novoValorVariacao);
      if (!opt) return;
      valorId = opt.id;
      valorNome = opt.nome;
    } else {
      valorNome = novoValorVariacao.trim();
      if (!valorNome) return;
    }

    if (linhasVariacao.some((l) => (valorId ? l.valorId === valorId : l.valorNome === valorNome))) {
      setNovoValorVariacao("");
      return;
    }

    setLinhasVariacao((atual) => [
      ...atual,
      { valorId, valorNome, estoque: "", sku: "", gtin: "", imagens: [] },
    ]);
    setNovoValorVariacao("");
  }

  function removerLinhaVariacao(indice: number) {
    setLinhasVariacao((atual) => atual.filter((_, i) => i !== indice));
  }

  function atualizarLinhaVariacao(indice: number, patch: Partial<LinhaVariacao>) {
    setLinhasVariacao((atual) => atual.map((l, i) => (i === indice ? { ...l, ...patch } : l)));
  }

  async function enviar() {
    setErroEnvio(null);

    if (!categoriaFinal) return setErroEnvio("Escolha uma categoria.");
    if (!titulo.trim()) return setErroEnvio("Informe o título do anúncio.");
    if (!preco || Number(preco) <= 0) return setErroEnvio("Informe um preço válido.");
    if (!tipoAnuncioEscolhido) return setErroEnvio("Calcule as tarifas e escolha o tipo de anúncio (Clássico/Premium).");
    if (contasSelecionadas.length === 0) return setErroEnvio("Selecione ao menos uma conta.");

    const faltandoPrincipais = atributosPrincipais.filter((a) => !valoresAtributos[a.id]?.trim());
    if (faltandoPrincipais.length > 0) {
      return setErroEnvio(`Preencha os campos obrigatórios: ${faltandoPrincipais.map((a) => a.nome).join(", ")}.`);
    }

    if (temVariacoes) {
      if (!atributoVariacaoId) return setErroEnvio("Escolha qual característica varia (ex.: Cor).");
      if (linhasVariacao.length === 0) return setErroEnvio("Adicione ao menos um valor de variação (ex.: Preto, Azul).");
      for (const l of linhasVariacao) {
        if (!l.estoque || Number(l.estoque) < 0) return setErroEnvio(`Informe o estoque da variação "${l.valorNome}".`);
        if (l.imagens.length === 0) return setErroEnvio(`Adicione ao menos uma foto da variação "${l.valorNome}".`);
      }
    } else {
      if (!estoque || Number(estoque) < 0) return setErroEnvio("Informe o estoque.");
      if (imagens.length === 0) return setErroEnvio("Adicione ao menos uma foto.");
    }

    const atributosParaEnviar: { id: string; value_id?: string; value_name?: string }[] = [
      ...atributosPrincipais.map((a) => ({ a, valor: valoresAtributos[a.id] })),
      ...atributosSecundarios
        .filter((a) => !naoSeAplica[a.id] && valoresAtributos[a.id]?.trim())
        .map((a) => ({ a, valor: valoresAtributos[a.id] })),
    ].map(({ a, valor }) =>
      a.valores ? { id: a.id, value_id: valor } : { id: a.id, value_name: valor }
    );

    const mapaEmbalagem: Record<string, { valor: string; unidade: string }> = {
      SELLER_PACKAGE_WIDTH: { valor: embalagem.largura, unidade: "cm" },
      SELLER_PACKAGE_LENGTH: { valor: embalagem.comprimento, unidade: "cm" },
      SELLER_PACKAGE_HEIGHT: { valor: embalagem.altura, unidade: "cm" },
      SELLER_PACKAGE_WEIGHT: { valor: embalagem.peso, unidade: "kg" },
    };
    for (const a of atributosEmbalagem) {
      const dado = mapaEmbalagem[a.id];
      if (dado?.valor) {
        atributosParaEnviar.push({ id: a.id, value_name: `${dado.valor} ${dado.unidade}` });
      }
    }

    const fd = new FormData();
    fd.set("titulo", titulo.trim());
    fd.set("categoriaId", categoriaFinal.id);
    fd.set("preco", preco);
    fd.set("descricao", descricao);
    fd.set("tipoAnuncio", tipoAnuncioEscolhido);
    if (freteGratis) fd.set("freteGratis", "on");
    fd.set("contaIds", contasSelecionadas.join(","));
    fd.set("atributosJson", JSON.stringify(atributosParaEnviar));

    if (temVariacoes) {
      fd.set("temVariacoes", "on");
      fd.set("atributoVariacaoId", atributoVariacaoId);
      fd.set(
        "variacoesJson",
        JSON.stringify(
          linhasVariacao.map((l) => ({
            atributoId: atributoVariacaoId,
            valorId: l.valorId,
            valorNome: l.valorNome,
            estoque: Number(l.estoque),
            sku: l.sku || undefined,
            gtin: l.gtin || undefined,
          }))
        )
      );
      linhasVariacao.forEach((l, i) => {
        for (const img of l.imagens) fd.append(`imagens_${i}`, img);
      });
    } else {
      fd.set("estoque", estoque);
      if (sku) fd.set("sku", sku);
      if (gtin && !semGtin) fd.set("gtin", gtin);
      for (const img of imagens) fd.append("imagens", img);
    }

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

  function renderAtributo(a: AtributoCategoria, opcional: boolean) {
    const desabilitado = opcional && naoSeAplica[a.id];
    return (
      <div key={a.id}>
        <div className="mb-1 flex items-center justify-between">
          <label className="block text-xs text-gray-500">
            {a.nome} {!opcional && <span className="text-red-500">*</span>}
          </label>
          {opcional && (
            <label className="flex items-center gap-1 text-[11px] text-gray-400">
              <input
                type="checkbox"
                checked={Boolean(naoSeAplica[a.id])}
                onChange={(e) => setNaoSeAplica((v) => ({ ...v, [a.id]: e.target.checked }))}
              />
              Não se aplica
            </label>
          )}
        </div>
        {a.valores ? (
          <select
            value={valoresAtributos[a.id] ?? ""}
            onChange={(e) => setValoresAtributos((v) => ({ ...v, [a.id]: e.target.value }))}
            disabled={desabilitado}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
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
            disabled={desabilitado}
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
          />
        )}
      </div>
    );
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
          <>
            <div className="flex items-center justify-between rounded bg-green-50 p-3 text-sm">
              <span>
                Categoria escolhida: <strong>{categoriaFinal.nome}</strong>
              </span>
              <button onClick={trocarCategoria} className="text-xs text-[var(--color-sixxis-blue)] underline">
                Trocar
              </button>
            </div>
            {tendenciasCategoria.length > 0 && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <p className="mb-1.5 text-xs text-gray-500">
                  🔥 Termos em alta nesta categoria (do mais para o menos buscado) — clique para incluir no título:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tendenciasCategoria.slice(0, 15).map((t) => (
                    <button
                      key={t.posicao}
                      onClick={() => inserirTermoNoTitulo(t.termo)}
                      title={`${t.posicao}º mais buscado`}
                      className="rounded-full border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:border-[var(--color-sixxis-navy)] hover:text-[var(--color-sixxis-navy)]"
                    >
                      <span className="mr-1 text-[10px] text-gray-400">{t.posicao}º</span>
                      {t.termo}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
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

      {/* Caracteristicas principais */}
      {categoriaFinal && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">2. Características principais</h2>
          {carregandoAtributos ? (
            <p className="text-sm text-gray-400">Carregando...</p>
          ) : atributosPrincipais.length === 0 ? (
            <p className="text-sm text-gray-400">Esta categoria não exige campos adicionais.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {atributosPrincipais.map((a) => renderAtributo(a, false))}
            </div>
          )}
        </div>
      )}

      {/* Caracteristicas secundarias / ficha tecnica */}
      {categoriaFinal && !carregandoAtributos && atributosSecundarios.length > 0 && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">3. Ficha técnica / especificações</h2>
          <p className="mb-3 text-xs text-gray-400">
            Campos opcionais. Marque &quot;Não se aplica&quot; para os que não fazem sentido para o seu produto — quanto
            mais completo, melhor a busca e a conversão do anúncio.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {atributosSecundarios.map((a) => renderAtributo(a, true))}
          </div>
        </div>
      )}

      {/* Variacoes */}
      {categoriaFinal && !carregandoAtributos && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">4. Variações</h2>
          {atributosVariacao.length === 0 ? (
            <p className="text-sm text-gray-400">Esta categoria não aceita variações.</p>
          ) : (
            <>
              <label className="mb-3 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={temVariacoes}
                  onChange={(e) => {
                    setTemVariacoes(e.target.checked);
                    if (!e.target.checked) {
                      setAtributoVariacaoId("");
                      setLinhasVariacao([]);
                    }
                  }}
                />
                Este produto tem variações (ex.: cor, voltagem, tamanho)
              </label>

              {temVariacoes && (
                <div className="space-y-3 border-t border-gray-100 pt-3">
                  <div>
                    <label className="mb-1 block text-xs text-gray-500">Qual característica varia?</label>
                    <select
                      value={atributoVariacaoId}
                      onChange={(e) => {
                        setAtributoVariacaoId(e.target.value);
                        setLinhasVariacao([]);
                      }}
                      className="w-full max-w-xs rounded border border-gray-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">Selecione...</option>
                      {atributosVariacao.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.nome}
                        </option>
                      ))}
                    </select>
                  </div>

                  {atributoVariacaoEscolhido && (
                    <div className="flex items-end gap-2">
                      <div className="flex-1 max-w-xs">
                        <label className="mb-1 block text-xs text-gray-500">
                          Valor de {atributoVariacaoEscolhido.nome}
                        </label>
                        {atributoVariacaoEscolhido.valores ? (
                          <select
                            value={novoValorVariacao}
                            onChange={(e) => setNovoValorVariacao(e.target.value)}
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          >
                            <option value="">Selecione...</option>
                            {atributoVariacaoEscolhido.valores.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.nome}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={novoValorVariacao}
                            onChange={(e) => setNovoValorVariacao(e.target.value)}
                            placeholder="Ex: Preto"
                            className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                          />
                        )}
                      </div>
                      <button
                        onClick={adicionarValorVariacao}
                        className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Adicionar
                      </button>
                    </div>
                  )}

                  {linhasVariacao.length > 0 && (
                    <div className="space-y-3">
                      {linhasVariacao.map((l, i) => (
                        <div key={`${l.valorId ?? l.valorNome}-${i}`} className="rounded border border-gray-200 p-3">
                          <div className="mb-2 flex items-center justify-between">
                            <strong className="text-sm text-gray-800">{l.valorNome}</strong>
                            <button onClick={() => removerLinhaVariacao(i)} className="text-xs text-red-500 underline">
                              Remover
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div>
                              <label className="mb-1 block text-[11px] text-gray-500">Estoque *</label>
                              <input
                                type="number"
                                value={l.estoque}
                                onChange={(e) => atualizarLinhaVariacao(i, { estoque: e.target.value })}
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-gray-500">SKU</label>
                              <input
                                value={l.sku}
                                onChange={(e) => atualizarLinhaVariacao(i, { sku: e.target.value })}
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-gray-500">Código universal (GTIN)</label>
                              <input
                                value={l.gtin}
                                onChange={(e) => atualizarLinhaVariacao(i, { gtin: e.target.value })}
                                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-[11px] text-gray-500">Fotos *</label>
                              <SeletorFotos
                                imagens={l.imagens}
                                onChange={(arquivos) => atualizarLinhaVariacao(i, { imagens: arquivos })}
                                compacto
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Dados sem variacao: estoque/sku/gtin/fotos */}
      {categoriaFinal && !carregandoAtributos && !temVariacoes && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">5. Estoque, identificação e fotos</h2>
          <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Estoque *</label>
              <input
                type="number"
                value={estoque}
                onChange={(e) => setEstoque(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">SKU (código interno)</label>
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Código universal (GTIN/EAN)</label>
              <input
                value={gtin}
                onChange={(e) => setGtin(e.target.value)}
                disabled={semGtin}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
              />
              <label className="mt-1 flex items-center gap-1 text-[11px] text-gray-400">
                <input type="checkbox" checked={semGtin} onChange={(e) => setSemGtin(e.target.checked)} />
                Meu produto não tem
              </label>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Fotos *</label>
            <SeletorFotos imagens={imagens} onChange={setImagens} />
          </div>
        </div>
      )}

      {/* Embalagem (para calculo automatico de frete pelo Mercado Envios) */}
      {categoriaFinal && !carregandoAtributos && atributosEmbalagem.length > 0 && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">6. Embalagem (para cálculo de frete)</h2>
          <p className="mb-3 text-xs text-gray-400">
            Medidas da caixa/embalagem que será enviada ao comprador pelo Mercado Envios. Opcional, mas recomendado —
            medidas incorretas podem gerar cobrança extra de frete ou penalidade.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Largura (cm)</label>
              <input
                type="number"
                value={embalagem.largura}
                onChange={(e) => setEmbalagem((v) => ({ ...v, largura: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Comprimento (cm)</label>
              <input
                type="number"
                value={embalagem.comprimento}
                onChange={(e) => setEmbalagem((v) => ({ ...v, comprimento: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Altura (cm)</label>
              <input
                type="number"
                value={embalagem.altura}
                onChange={(e) => setEmbalagem((v) => ({ ...v, altura: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Peso (kg)</label>
              <input
                type="number"
                step="0.01"
                value={embalagem.peso}
                onChange={(e) => setEmbalagem((v) => ({ ...v, peso: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Preco + tipo de anuncio */}
      {categoriaFinal && !carregandoAtributos && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-700">7. Preço e tipo de anúncio</h2>
          <div className="mb-3 flex items-end gap-2">
            <div className="max-w-[160px]">
              <label className="mb-1 block text-xs text-gray-500">Preço (R$)</label>
              <input
                type="number"
                step="0.01"
                value={preco}
                onChange={(e) => {
                  setPreco(e.target.value);
                  setTiposAnuncio(null);
                  setTipoAnuncioEscolhido("");
                }}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={calcularTarifas}
              disabled={carregandoTipos}
              className="rounded bg-[var(--color-sixxis-navy)] px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
            >
              {carregandoTipos ? "Calculando..." : "Calcular tarifas"}
            </button>
          </div>

          {erroTipos && <p className="mb-2 text-sm text-red-600">{erroTipos}</p>}

          {tiposAnuncio && tiposAnuncio.length > 0 && (
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {tiposAnuncio.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTipoAnuncioEscolhido(t.id)}
                  className={`rounded border p-3 text-left text-sm ${
                    tipoAnuncioEscolhido === t.id
                      ? "border-[var(--color-sixxis-navy)] bg-blue-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div className="font-medium text-gray-800">{t.nome}</div>
                  <div className="text-xs text-gray-500">Tarifa de venda estimada: R$ {t.tarifaVenda.toFixed(2)}</div>
                </button>
              ))}
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={freteGratis} onChange={(e) => setFreteGratis(e.target.checked)} />
            Frete grátis
          </label>
        </div>
      )}

      {/* Descricao */}
      {categoriaFinal && !carregandoAtributos && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">8. Descrição (opcional)</h2>
          <textarea
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={4}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      )}

      {/* Contas */}
      {categoriaFinal && !carregandoAtributos && (
        <div className="rounded border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">9. Publicar nas contas</h2>
          <p className="mb-3 text-xs text-gray-500">
            O mesmo anúncio (título, características, fotos, categoria, preço e estoque) será criado em cada conta
            selecionada.
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

      {categoriaFinal && !carregandoAtributos && (
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
