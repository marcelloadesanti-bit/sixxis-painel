"use client";

import { useState } from "react";
import {
    listarContasClonagemAction,
    listarAnunciosParaClonarAction,
    buscarPreviewClonagemAction,
    buscarTiposAnuncioClonagemAction,
    clonarAnuncioAction,
    type ContaClonagem,
} from "./clonar-actions";
import type { AnuncioPicker, ItemParaClonagem } from "@/lib/mercadolivre/clonagem";
import type { TipoAnuncio } from "@/lib/mercadolivre/categorias";
import type { ResultadoContaCriacao } from "./actions";

export default function ClonarAnuncioForm() {
    const [contas, setContas] = useState<ContaClonagem[] | null>(null);
    const [carregandoContas, setCarregandoContas] = useState(false);
    const [erroInicial, setErroInicial] = useState<string | null>(null);

  const [contaOrigemId, setContaOrigemId] = useState("");
    const [anuncios, setAnuncios] = useState<AnuncioPicker[] | null>(null);
    const [carregandoAnuncios, setCarregandoAnuncios] = useState(false);
    const [buscaAnuncio, setBuscaAnuncio] = useState("");

  const [itemSelecionadoId, setItemSelecionadoId] = useState<string | null>(null);
    const [preview, setPreview] = useState<ItemParaClonagem | null>(null);
    const [carregandoPreview, setCarregandoPreview] = useState(false);
    const [erroPreview, setErroPreview] = useState<string | null>(null);

  const [contasDestino, setContasDestino] = useState<string[]>([]);
    const [modo, setModo] = useState<"simples" | "editavel">("simples");

  // campos editaveis (modo "editavel")
  const [tituloEdit, setTituloEdit] = useState("");
    const [precoEdit, setPrecoEdit] = useState("");
    const [descricaoEdit, setDescricaoEdit] = useState("");
    const [freteGratisEdit, setFreteGratisEdit] = useState(false);
    const [estoqueEdit, setEstoqueEdit] = useState("");
    const [estoquePorVariacaoEdit, setEstoquePorVariacaoEdit] = useState<Record<number, string>>({});
    const [tiposAnuncio, setTiposAnuncio] = useState<TipoAnuncio[] | null>(null);
    const [tipoAnuncioEdit, setTipoAnuncioEdit] = useState("");
    const [carregandoTipos, setCarregandoTipos] = useState(false);

  const [enviando, setEnviando] = useState(false);
    const [erroEnvio, setErroEnvio] = useState<string | null>(null);
    const [resultados, setResultados] = useState<ResultadoContaCriacao[] | null>(null);

  function carregarContas() {
        if (contas || carregandoContas) return;
        setCarregandoContas(true);
        listarContasClonagemAction()
          .then(setContas)
          .catch((err) => setErroInicial(err instanceof Error ? err.message : "Erro ao carregar contas."))
          .finally(() => setCarregandoContas(false));
  }

  // carrega a lista de contas assim que o componente aparece na tela
  if (!contas && !carregandoContas && !erroInicial) {
        carregarContas();
  }

  function selecionarContaOrigem(id: string) {
        setContaOrigemId(id);
        setAnuncios(null);
        setItemSelecionadoId(null);
        setPreview(null);
        setResultados(null);
        setErroPreview(null);
        if (!id) return;
        setCarregandoAnuncios(true);
        listarAnunciosParaClonarAction(id)
          .then(setAnuncios)
          .catch((err) => setErroPreview(err instanceof Error ? err.message : "Erro ao listar anúncios."))
          .finally(() => setCarregandoAnuncios(false));
  }

  function selecionarAnuncio(id: string) {
        setItemSelecionadoId(id);
        setPreview(null);
        setErroPreview(null);
        setResultados(null);
        setCarregandoPreview(true);
        buscarPreviewClonagemAction(contaOrigemId, id)
          .then((p) => {
                    setPreview(p);
                    setTituloEdit(p.titulo);
                    setPrecoEdit(String(p.preco));
                    setDescricaoEdit(p.descricao);
                    setFreteGratisEdit(p.freteGratis);
                    setEstoqueEdit(p.estoque !== null ? String(p.estoque) : "");
                    const mapa: Record<number, string> = {};
                    for (const v of p.variacoes) mapa[v.id] = String(v.estoque);
                    setEstoquePorVariacaoEdit(mapa);
                    setTipoAnuncioEdit(p.tipoAnuncio);
                    setTiposAnuncio(null);
                    setModo("simples");
                    // por padrao, marca todas as contas exceto a de origem
                        setContasDestino((contas ?? []).filter((c) => c.id !== contaOrigemId).map((c) => c.id));
          })
          .catch((err) => setErroPreview(err instanceof Error ? err.message : "Erro ao carregar anúncio."))
          .finally(() => setCarregandoPreview(false));
  }

  function alternarContaDestino(id: string) {
        setContasDestino((atual) => (atual.includes(id) ? atual.filter((c) => c !== id) : [...atual, id]));
  }

  async function recalcularTarifas() {
        if (!preview || !precoEdit || Number(precoEdit) <= 0) return;
        setCarregandoTipos(true);
        try {
                const tipos = await buscarTiposAnuncioClonagemAction(preview.categoriaId, Number(precoEdit));
                setTiposAnuncio(tipos);
                if (tipos.length > 0 && !tipos.some((t) => t.id === tipoAnuncioEdit)) {
                          setTipoAnuncioEdit(tipos[0].id);
                }
        } catch {
                // silencioso -- mantem o tipo de anuncio original se o calculo falhar
        } finally {
                setCarregandoTipos(false);
        }
  }

  async function executarClonagem() {
        setErroEnvio(null);
        if (!preview) return;
        if (contasDestino.length === 0) return setErroEnvio("Selecione ao menos uma conta de destino.");

      const overrides =
              modo === "editavel"
            ? {
                          titulo: tituloEdit.trim() || undefined,
                          preco: precoEdit ? Number(precoEdit) : undefined,
                          descricao: descricaoEdit,
                          freteGratis: freteGratisEdit,
                          tipoAnuncio: tipoAnuncioEdit || undefined,
                          estoque: !preview.temVariacoes && estoqueEdit ? Number(estoqueEdit) : undefined,
                          estoquePorVariacao: preview.temVariacoes
                            ? Object.fromEntries(
                                                Object.entries(estoquePorVariacaoEdit)
                                                  .filter(([, v]) => v !== "")
                                                  .map(([id, v]) => [Number(id), Number(v)])
                                              )
                                          : undefined,
            }
                : undefined;

      setEnviando(true);
        try {
                const resultado = await clonarAnuncioAction({
                          contaOrigemId,
                          itemId: preview.id,
                          contasDestinoIds: contasDestino,
                          overrides,
                });
                setResultados(resultado.resultados);
        } catch (err) {
                setErroEnvio(err instanceof Error ? err.message : "Erro ao clonar anúncio.");
        } finally {
                setEnviando(false);
        }
  }

  const anunciosFiltrados = (anuncios ?? []).filter((a) =>
        a.titulo.toLowerCase().includes(buscaAnuncio.toLowerCase())
                                                      );

  if (erroInicial) return <p className="rounded bg-red-50 p-4 text-sm text-red-600">{erroInicial}</p>;
    if (!contas) return <p className="text-sm text-gray-400">Carregando contas...</p>;

  if (resultados) {
        return (
                <div className="rounded border border-gray-200 bg-white p-6">
                  <h2 className="mb-4 text-lg font-semibold text-[var(--color-sixxis-navy)]">Resultado da clonagem</h2>
            <div className="space-y-2">
    {resultados.map((r) => (
                  <div
                    key={r.contaId}
                    className={`flex items-center justify-between rounded p-3 text-sm ${r.ok ? "bg-green-50" : "bg-red-50"}`}
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
          Clonar outro anúncio
        </button>
      </div>
    );
}

  return (
        <div className="space-y-6">
      <div className="rounded border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">1. Conta de origem</h2>
        <p className="mb-3 text-xs text-gray-500">De qual conta você quer clonar um anúncio já existente?</p>
                  <select
          value={contaOrigemId}
          onChange={(e) => selecionarContaOrigem(e.target.value)}
          className="w-full max-w-sm rounded border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Selecione a conta...</option>
{contas.map((c) => (
              <option key={c.id} value={c.id}>
{c.nickname}
            </option>
          ))}
        </select>
      </div>

{contaOrigemId && (
          <div className="rounded border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">2. Anúncio a clonar</h2>
           <input
             value={buscaAnuncio}
             onChange={(e) => setBuscaAnuncio(e.target.value)}
             placeholder="Buscar por título..."
             className="mb-3 w-full max-w-sm rounded border border-gray-300 px-3 py-2 text-sm"
           />
 {carregandoAnuncios ? (
               <p className="text-sm text-gray-400">Carregando anúncios...</p>
             ) : (
                           <div className="max-h-80 space-y-1 overflow-y-auto">
  {anunciosFiltrados.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => selecionarAnuncio(a.id)}
                      className={`flex w-full items-center gap-3 rounded border p-2 text-left text-sm ${
                                            itemSelecionadoId === a.id
                                              ? "border-[var(--color-sixxis-navy)] bg-blue-50"
                                              : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
  {a.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.thumbnail} alt="" className="h-10 w-10 rounded object-cover" />
                      )}
                    <span className="flex-1 truncate">{a.titulo}</span>
                    <span className="whitespace-nowrap text-xs text-gray-500">
  {new Intl.NumberFormat("pt-BR", { style: "currency", currency: a.moeda }).format(a.preco)}
                    </span>
                  </button>
                ))}
 {anunciosFiltrados.length === 0 && <p className="text-sm text-gray-400">Nenhum anúncio encontrado.</p>}
             </div>
           )}
        </div>
      )}

{erroPreview && <p className="rounded bg-red-50 p-3 text-sm text-red-600">{erroPreview}</p>}
{carregandoPreview && <p className="text-sm text-gray-400">Carregando anúncio...</p>}

{preview && (
          <>
            <div className="rounded border border-gray-200 bg-white p-4">
             <h2 className="mb-2 text-sm font-semibold text-gray-700">3. Prévia</h2>
             <div className="flex items-center gap-3">
 {preview.thumbnail && (
                   // eslint-disable-next-line @next/next/no-img-element
                   <img src={preview.thumbnail} alt="" className="h-16 w-16 rounded object-cover" />
                 )}
               <div>
                 <p className="text-sm font-medium text-gray-800">{preview.titulo}</p>
                 <p className="text-xs text-gray-500">{preview.categoriaNome}</p>
 {preview.temVariacoes && (
                     <p className="text-xs text-gray-500">
  {preview.variacoes.length} variações
  {!preview.variacaoAtributoUnico && " (mais de uma característica)"}
                    </p>
                  )}
               </div>
             </div>
           </div>

          <div className="rounded border border-gray-200 bg-white p-4">
             <h2 className="mb-2 text-sm font-semibold text-gray-700">4. Contas de destino</h2>
             <div className="flex flex-wrap gap-2">
 {contas.map((c) => (
                   <label
                     key={c.id}
                     className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3 py-1 text-xs text-gray-700"
                   >
                     <input
                      type="checkbox"
                      checked={contasDestino.includes(c.id)}
                     onChange={() => alternarContaDestino(c.id)}
                   />
                   <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: c.cor }} />
{c.nickname}
{c.id === contaOrigemId && <span className="text-gray-400">(origem)</span>}
                </label>
              ))}
            </div>
          </div>

          <div className="rounded border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-gray-700">5. Modo de clonagem</h2>
            <div className="space-y-2">
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="modo"
                  checked={modo === "simples"}
                                      onChange={() => setModo("simples")}
                  className="mt-0.5"
                />
                <span>
                  <strong>Cópia simples</strong> — publica o anúncio imediatamente nas contas selecionadas, com os
                  mesmos dados do anúncio de origem (título, preço, fotos, estoque, categoria).
                                    </span>
                                  </label>
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="radio"
                  name="modo"
                  checked={modo === "editavel"}
                                      onChange={() => setModo("editavel")}
                  className="mt-0.5"
                />
                <span>
                  <strong>Editável</strong> — revise título, preço, estoque, frete e descrição antes de publicar.
                                    </span>
              </label>
            </div>
          </div>

{modo === "editavel" && (
              <div className="rounded border border-gray-200 bg-white p-4">
                <h2 className="mb-3 text-sm font-semibold text-gray-700">6. Revisar dados</h2>
               <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                 <div className="sm:col-span-2">
                   <label className="mb-1 block text-xs text-gray-500">Título</label>
                   <input
                     value={tituloEdit}
                     onChange={(e) => setTituloEdit(e.target.value.slice(0, 60))}
                     maxLength={60}
                     className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                   />
                 </div>
                 <div>
                   <label className="mb-1 block text-xs text-gray-500">Preço (R$)</label>
                   <input
                     type="number"
                     step="0.01"
                     value={precoEdit}
                     onChange={(e) => {
                                             setPrecoEdit(e.target.value);
                                             setTiposAnuncio(null);
                     }}
                     className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                   />
                 </div>
 {!preview.temVariacoes && (
                     <div>
                       <label className="mb-1 block text-xs text-gray-500">Estoque</label>
                      <input
                        type="number"
                        value={estoqueEdit}
                        onChange={(e) => setEstoqueEdit(e.target.value)}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  )}
               </div>

 {preview.temVariacoes && (
                   <div className="mb-3 space-y-2">
                     <p className="text-xs text-gray-500">Estoque por variação</p>
  {preview.variacoes.map((v) => (
                        <div key={v.id} className="flex items-center gap-2">
                          <span className="w-40 truncate text-sm text-gray-700">
   {v.combinacao.map((c) => c.valorNome).join(" / ") || `Variação ${v.id}`}
                         </span>
                         <input
                           type="number"
                           value={estoquePorVariacaoEdit[v.id] ?? ""}
                          onChange={(e) =>
                                                      setEstoquePorVariacaoEdit((atual) => ({ ...atual, [v.id]: e.target.value }))
                            }
                          className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                      </div>
                    ))}
                 </div>
               )}

              <div className="mb-3 flex items-center gap-2">
                <button
                  onClick={recalcularTarifas}
                  disabled={carregandoTipos}
                  className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
{carregandoTipos ? "Calculando..." : "Recalcular tipo de anúncio"}
                </button>
{tiposAnuncio && tiposAnuncio.length > 0 && (
                    <select
                      value={tipoAnuncioEdit}
                     onChange={(e) => setTipoAnuncioEdit(e.target.value)}
                     className="rounded border border-gray-300 px-2 py-1.5 text-sm"
                   >
 {tiposAnuncio.map((t) => (
                         <option key={t.id} value={t.id}>
 {t.nome}
                       </option>
                     ))}
                  </select>
                )}
              </div>

              <label className="mb-3 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={freteGratisEdit}
                  onChange={(e) => setFreteGratisEdit(e.target.checked)}
                />
                Frete grátis
              </label>

              <div>
                <label className="mb-1 block text-xs text-gray-500">Descrição</label>
                <textarea
                  value={descricaoEdit}
                  onChange={(e) => setDescricaoEdit(e.target.value)}
                  rows={4}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="mt-3">
                <p className="mb-1 text-xs text-gray-500">Fotos do anúncio original (mantidas na clonagem):</p>
                <div className="flex flex-wrap gap-2">
{preview.fotos.map((f, i) => (
                      // eslint-disable-next-line @next/next/no-img-element
                                       <img key={i} src={f.source} alt="" className="h-14 w-14 rounded border border-gray-200 object-cover" />
                    ))}
                </div>
              </div>
            </div>
          )}

          <div>
{erroEnvio && <p className="mb-3 rounded bg-red-50 p-3 text-sm text-red-600">{erroEnvio}</p>}
            <button
              onClick={executarClonagem}
              disabled={enviando}
              className="rounded bg-[var(--color-sixxis-navy)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
{enviando ? "Clonando..." : modo === "simples" ? "Clonar agora" : "Publicar clonagem"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
