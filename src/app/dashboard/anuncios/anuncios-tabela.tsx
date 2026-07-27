"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LinhaAnuncio, OrdenacaoAnuncios } from "@/lib/mercadolivre/items";

const formatarMoeda = (valor: number, moeda: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda || "BRL" }).format(valor);

function badgeSaude(saude: number | null) {
  if (saude === null) return { label: "—", cor: "bg-gray-100 text-gray-500" };
  if (saude >= 0.8) return { label: "Muito bem!", cor: "bg-green-50 text-green-700" };
  if (saude >= 0.5) return { label: "Regular", cor: "bg-yellow-50 text-yellow-700" };
  return { label: "Precisa de atenção", cor: "bg-red-50 text-red-600" };
}

function badgeCatalogo(status: LinhaAnuncio["precoParaGanhar"]) {
  if (!status) return { label: "—", cor: "bg-gray-100 text-gray-400" };
  if (status.status === "not_listed") return { label: "Fora do catálogo", cor: "bg-gray-100 text-gray-500" };
  if (status.status.includes("win") || status.status === "listed")
    return { label: "Ganhando", cor: "bg-green-50 text-green-700" };
  return { label: "Perdendo", cor: "bg-red-50 text-red-600" };
}

// Cabecalho de coluna clicavel: reaproveita o mesmo mecanismo de ordenacao
// (query params ordenar/pagina) ja usado pelo AnunciosFiltros, entao um
// clique aqui produz o mesmo resultado que escolher a opcao equivalente no
// filtro "Ordenar por" -- so que direto na coluna, com indicacao visual de
// qual metrica esta ativa no momento.
function ThOrdenavel({
  label,
  chave,
  ordenacaoAtual,
}: {
  label: string;
  chave: OrdenacaoAnuncios;
  ordenacaoAtual: OrdenacaoAnuncios;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ativo = ordenacaoAtual === chave;

  function ordenarPor() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("ordenar", chave);
    params.set("pagina", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <th className="px-3 py-2">
      <button
        type="button"
        onClick={ordenarPor}
        title={`Ordenar por ${label.toLowerCase()}`}
        className={`flex items-center gap-1 uppercase hover:text-gray-700 ${
          ativo ? "font-semibold text-[var(--color-sixxis-navy)]" : ""
        }`}
      >
        {label}
        <span className={`text-[10px] ${ativo ? "opacity-100" : "opacity-0"}`}>▼</span>
      </button>
    </th>
  );
}

export default function AnunciosTabela({
  linhas,
  periodoLabel,
  colunaVendidos = "periodo",
  ordenacaoAtual,
  editavel = false,
}: {
  linhas: LinhaAnuncio[];
  periodoLabel?: string;
  colunaVendidos?: "periodo" | "total";
  // Ordenacao atualmente aplicada (vem da URL). Usada para destacar a coluna
  // ativa e montar os links de "ordenar por esta coluna".
  ordenacaoAtual: OrdenacaoAnuncios;
  // Quando true, o anuncio vira link para a tela de edicao (Editar anuncios).
  // Quando false (Resumo), a linha e apenas informativa, sem navegacao.
  editavel?: boolean;
}) {
  const labelVendidos =
    colunaVendidos === "total" ? "Vendidos (desde a criação)" : `Vendidos${periodoLabel ? ` (${periodoLabel})` : ""}`;
  if (linhas.length === 0) {
    return (
      <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
        Nenhum anúncio encontrado.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-gray-200 bg-white">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase text-gray-400">
            <th className="px-3 py-2">Anúncio</th>
            <th className="px-3 py-2">Preço</th>
            <th className="px-3 py-2">Estoque</th>
            <ThOrdenavel label={labelVendidos} chave="mais_vendidos" ordenacaoAtual={ordenacaoAtual} />
            <ThOrdenavel
              label={`Visitas${periodoLabel ? ` (${periodoLabel})` : ""}`}
              chave="mais_visualizados"
              ordenacaoAtual={ordenacaoAtual}
            />
            <ThOrdenavel label="Conversão" chave="maior_conversao" ordenacaoAtual={ordenacaoAtual} />
            <ThOrdenavel label="Qualidade" chave="melhor_qualidade" ordenacaoAtual={ordenacaoAtual} />
            <th className="px-3 py-2">Catálogo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {linhas.map((linha) => {
            const saude = badgeSaude(linha.saude);
            const catalogo = badgeCatalogo(linha.precoParaGanhar);
            return (
              <tr key={linha.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  {editavel ? (
                    <a
                      href={`/dashboard/anuncios/gestao/${linha.id}?conta=${linha.contaId}`}
                      className="flex items-center gap-3"
                    >
                      {linha.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={linha.thumbnail} alt="" className="h-10 w-10 rounded object-cover" />
                      )}
                      <div>
                        <p className="line-clamp-1 max-w-xs font-medium text-gray-800 hover:underline">{linha.titulo}</p>
                        <p className="flex items-center gap-1 text-xs text-gray-400">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: linha.contaCor }}
                          />
                          {linha.contaNickname} · {linha.id}
                        </p>
                      </div>
                    </a>
                  ) : (
                    <div className="flex items-center gap-3">
                      {linha.thumbnail && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={linha.thumbnail} alt="" className="h-10 w-10 rounded object-cover" />
                      )}
                      <div>
                        <p className="line-clamp-1 max-w-xs font-medium text-gray-800">{linha.titulo}</p>
                        <p className="flex items-center gap-1 text-xs text-gray-400">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: linha.contaCor }}
                          />
                          {linha.contaNickname} · {linha.id}
                        </p>
                      </div>
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-800">{formatarMoeda(linha.preco, linha.moeda)}</td>
                <td className="px-3 py-2 text-gray-600">{linha.estoqueDisponivel}</td>
                <td className="px-3 py-2 text-gray-600">{colunaVendidos === "total" ? linha.vendidosTotal : linha.vendidosPeriodo}</td>
                <td className="px-3 py-2 text-gray-600">{linha.visitasPeriodo ?? "—"}</td>
                <td className="px-3 py-2 text-gray-600">
                  {linha.conversao !== null ? `${linha.conversao}%` : "—"}
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${saude.cor}`}>{saude.label}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${catalogo.cor}`}>
                    {catalogo.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
