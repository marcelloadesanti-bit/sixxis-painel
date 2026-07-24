import Link from "next/link";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getAnuncioDetalhe } from "@/lib/mercadolivre/items";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import {
  atualizarPrecoAction,
  atualizarEstoqueAction,
  pausarOuAtivarAction,
  atualizarTituloAction,
  atualizarVariacaoAction,
} from "./actions";

const formatarMoeda = (valor: number, moeda: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(valor);

const formatarDataHora = (iso: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));

function badgeSaude(saude: number | null) {
  if (saude === null) return { label: "—", cor: "bg-gray-100 text-gray-500" };
  if (saude >= 0.8) return { label: `Muito bem! (${Math.round(saude * 100)}%)`, cor: "bg-green-50 text-green-700" };
  if (saude >= 0.5) return { label: `Regular (${Math.round(saude * 100)}%)`, cor: "bg-yellow-50 text-yellow-700" };
  return { label: `Precisa de atenção (${Math.round(saude * 100)}%)`, cor: "bg-red-50 text-red-600" };
}

export default async function GestaoAnuncioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ conta?: string; ok?: string; erro?: string }>;
}) {
  const { podeEditar } = await exigirAcessoSecao("anuncios", "gestao");
  const { id } = await params;
  const { conta: contaId, ok, erro } = await searchParams;

  if (!contaId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-red-500">Link inválido: falta o parâmetro da conta.</p>
        <Link href="/dashboard/anuncios" className="text-sm text-[var(--color-sixxis-blue)] underline">
          ← Voltar
        </Link>
      </div>
    );
  }

  let anuncio: Awaited<ReturnType<typeof getAnuncioDetalhe>> = null;
  let erroCarregamento: string | null = null;

  try {
    const accessToken = await getValidAccessToken(contaId);
    anuncio = await getAnuncioDetalhe(accessToken, id);
  } catch (err) {
    console.error(`Erro ao buscar anuncio ${id}:`, err);
    erroCarregamento = "Não foi possível carregar este anúncio agora.";
  }

  if (!anuncio) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <p className="text-sm text-red-500">{erroCarregamento ?? "Anúncio não encontrado."}</p>
        <Link href="/dashboard/anuncios" className="text-sm text-[var(--color-sixxis-blue)] underline">
          ← Voltar
        </Link>
      </div>
    );
  }

  const saude = badgeSaude(anuncio.saude);

  const MENSAGENS_OK: Record<string, string> = {
    preco: "Preço atualizado com sucesso.",
    estoque: "Estoque atualizado com sucesso.",
    status: "Status atualizado com sucesso.",
    titulo: "Título atualizado com sucesso.",
    variacao: "Variação atualizada com sucesso.",
  };

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link href="/dashboard/anuncios" className="text-sm text-[var(--color-sixxis-blue)] underline">
        ← Voltar para Anúncios
      </Link>

      <div className="mt-2 mb-1 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-sixxis-navy)]">{anuncio.titulo}</h1>
          <p className="text-sm text-gray-500">
            {anuncio.id} ·{" "}
            <a href={anuncio.permalink} target="_blank" rel="noreferrer" className="text-[var(--color-sixxis-blue)] underline">
              ver no Mercado Livre ↗
            </a>
          </p>
        </div>
        {anuncio.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={anuncio.thumbnail} alt="" className="h-16 w-16 rounded object-cover" />
        )}
      </div>

      {ok && (
        <p className="mb-4 rounded bg-green-50 p-3 text-sm text-green-700">
          {MENSAGENS_OK[ok] ?? "Atualizado com sucesso."}
        </p>
      )}
      {erro && <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-600">{decodeURIComponent(erro)}</p>}

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Status</p>
          <p className="text-sm font-semibold text-gray-900">
            {anuncio.status === "active" ? "Ativo" : anuncio.status === "paused" ? "Pausado" : anuncio.status}
          </p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Vendidos</p>
          <p className="text-sm font-semibold text-gray-900">{anuncio.vendidos}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="text-xs uppercase text-gray-400">Visitas 7 dias</p>
          <p className="text-sm font-semibold text-gray-900">{anuncio.visitasPeriodo ?? "—"}</p>
        </div>
        <div className="rounded border border-gray-200 bg-white p-4">
          <p className="mb-1 text-xs uppercase text-gray-400">Qualidade do anúncio</p>
          <span className={`rounded-full px-2 py-1 text-xs font-medium ${saude.cor}`}>{saude.label}</span>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-700">Título</h2>
      {podeEditar ? (
        <form action={atualizarTituloAction} className="mb-6 flex items-start gap-2">
          <input type="hidden" name="contaId" value={contaId} />
          <input type="hidden" name="itemId" value={anuncio.id} />
          <input
            name="titulo"
            defaultValue={anuncio.titulo}
            required
            maxLength={60}
            className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
          />
          <button type="submit" className="rounded bg-[var(--color-sixxis-navy)] px-3 py-2 text-xs font-medium text-white">
            Salvar
          </button>
        </form>
      ) : (
        <p className="mb-6 text-xs italic text-gray-400">Acesso somente leitura.</p>
      )}

      {anuncio.variacoes.length === 0 ? (
        <>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Preço e estoque</h2>
          {podeEditar ? (
            <div className="mb-6 flex flex-wrap gap-4">
              <form action={atualizarPrecoAction} className="flex items-end gap-2">
                <input type="hidden" name="contaId" value={contaId} />
                <input type="hidden" name="itemId" value={anuncio.id} />
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Preço ({anuncio.moeda})</label>
                  <input
                    type="number"
                    name="preco"
                    step="0.01"
                    defaultValue={anuncio.preco}
                    required
                    className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <button type="submit" className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white">
                  Salvar preço
                </button>
              </form>
              <form action={atualizarEstoqueAction} className="flex items-end gap-2">
                <input type="hidden" name="contaId" value={contaId} />
                <input type="hidden" name="itemId" value={anuncio.id} />
                <div>
                  <label className="mb-1 block text-xs text-gray-500">Estoque disponível</label>
                  <input
                    type="number"
                    name="estoque"
                    defaultValue={anuncio.estoqueDisponivel}
                    required
                    className="w-32 rounded border border-gray-300 px-2 py-1.5 text-sm"
                  />
                </div>
                <button type="submit" className="rounded bg-[var(--color-sixxis-navy)] px-3 py-1.5 text-xs font-medium text-white">
                  Salvar estoque
                </button>
              </form>
            </div>
          ) : (
            <p className="mb-6 text-sm text-gray-600">
              {formatarMoeda(anuncio.preco, anuncio.moeda)} · {anuncio.estoqueDisponivel} em estoque
            </p>
          )}
        </>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Variações</h2>
          <div className="mb-6 overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-400">
                  <th className="px-3 py-2">Combinação</th>
                  <th className="px-3 py-2">SKU</th>
                  <th className="px-3 py-2">Preço</th>
                  <th className="px-3 py-2">Estoque</th>
                  <th className="px-3 py-2">Vendidos</th>
                  {podeEditar && <th className="px-3 py-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {anuncio.variacoes.map((v) => (
                  <tr key={v.id}>
                    <td className="px-3 py-2 text-gray-800">{v.combinacoes || "—"}</td>
                    <td className="px-3 py-2 text-gray-500">{v.sku ?? "—"}</td>
                    {podeEditar ? (
                      <>
                        <td className="px-3 py-2" colSpan={3}>
                          <form action={atualizarVariacaoAction} className="flex items-center gap-2">
                            <input type="hidden" name="contaId" value={contaId} />
                            <input type="hidden" name="itemId" value={anuncio.id} />
                            <input type="hidden" name="variacaoId" value={v.id} />
                            <input
                              type="number"
                              step="0.01"
                              name="preco"
                              defaultValue={v.preco}
                              className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                            <input
                              type="number"
                              name="estoque"
                              defaultValue={v.estoqueDisponivel}
                              className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                            <span className="text-xs text-gray-400">{v.vendidos} vendidos</span>
                            <button
                              type="submit"
                              className="rounded bg-[var(--color-sixxis-navy)] px-2 py-1 text-xs font-medium text-white"
                            >
                              Salvar
                            </button>
                          </form>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-gray-800">{formatarMoeda(v.preco, anuncio.moeda)}</td>
                        <td className="px-3 py-2 text-gray-600">{v.estoqueDisponivel}</td>
                        <td className="px-3 py-2 text-gray-600">{v.vendidos}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {podeEditar && (
        <>
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Visibilidade</h2>
          <form action={pausarOuAtivarAction} className="mb-6">
            <input type="hidden" name="contaId" value={contaId} />
            <input type="hidden" name="itemId" value={anuncio.id} />
            <input type="hidden" name="status" value={anuncio.status === "active" ? "paused" : "active"} />
            <button
              type="submit"
              className={`rounded px-3 py-1.5 text-xs font-medium ${
                anuncio.status === "active"
                  ? "border border-red-300 text-red-600 hover:bg-red-50"
                  : "bg-[var(--color-sixxis-navy)] text-white"
              }`}
            >
              {anuncio.status === "active" ? "Pausar anúncio" : "Reativar anúncio"}
            </button>
          </form>
        </>
      )}

      <h2 className="mb-2 text-sm font-semibold text-gray-700">Frete</h2>
      <p className="mb-6 text-sm text-gray-600">
        {anuncio.frete.freteGratis ? "Frete grátis" : "Frete pago pelo comprador"} ·{" "}
        {anuncio.frete.tipoLogistico === "fulfillment"
          ? "Full"
          : anuncio.frete.modo === "me2"
            ? "Mercado Envios"
            : anuncio.frete.modo}
      </p>

      <h2 className="mb-2 text-sm font-semibold text-gray-700">Ficha técnica</h2>
      <div className="mb-6 overflow-hidden rounded border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {anuncio.atributos.map((a) => (
              <tr key={a.id}>
                <td className="w-1/3 px-3 py-2 text-xs text-gray-400">{a.nome}</td>
                <td className="px-3 py-2 text-gray-700">{a.valor ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-700">Descrição</h2>
      <p className="mb-6 whitespace-pre-line rounded border border-gray-200 bg-white p-4 text-sm text-gray-700">
        {anuncio.descricao || "Sem descrição."}
      </p>

      <p className="text-xs text-gray-400">
        Criado em {formatarDataHora(anuncio.dataInicio)} · Atualizado em {formatarDataHora(anuncio.dataAtualizacao)}
      </p>
    </div>
  );
}
