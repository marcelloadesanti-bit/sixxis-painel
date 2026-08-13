type FunilVendasProps = {
  visitas: number;
  temVisitas: boolean;
  vendasQtd: number;
  vendasValor: number;
  moeda: string;
  cor: string;
  rotulo: string;
};

const formatarMoedaFunil = (valor: number, moeda: string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(valor);

const formatarNumeroFunil = (n: number) => n.toLocaleString("pt-BR");

// Funil de conversao (Visitas unicas -> Vendas brutas), inspirado no grafico
// "Conversao de visitas" do proprio painel do Mercado Livre. La eles tem 3
// estagios (visitas / intencao de compra / vendas); "intencao de compra" e
// uma metrica interna deles, sem endpoint publico na API -- por isso aqui o
// funil e de 2 estagios, com os dados que realmente conseguimos buscar
// (items_visits + Orders). O formato do funil (estreitando rapido no
// primeiro terco e mantendo uma "cauda" fina ate o fim) e so estetico, nao
// e literalmente proporcional ao percentual de conversao -- do contrario,
// com conversoes tipicas de 1-3%, a "cauda" ficaria invisivel.
export default function FunilVendas({
  visitas,
  temVisitas,
  vendasQtd,
  vendasValor,
  moeda,
  cor,
  rotulo,
}: FunilVendasProps) {
  const conversaoPct = temVisitas && visitas > 0 ? (vendasQtd / visitas) * 100 : null;

  const largura = 640;
  const centroY = 100;
  const alturaEsquerda = 78;
  const alturaDireita = 8;
  const path = `M0,${centroY - alturaEsquerda} C${largura * 0.32},${centroY - alturaEsquerda} ${largura * 0.32},${centroY - alturaDireita} ${largura},${centroY - alturaDireita} L${largura},${centroY + alturaDireita} C${largura * 0.32},${centroY + alturaDireita} ${largura * 0.32},${centroY + alturaEsquerda} 0,${centroY + alturaEsquerda} Z`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Funil de conversão</h3>
        <span className="text-xs text-gray-400">{rotulo}</span>
      </div>
      <div className="mb-4">
        <p className="text-xs uppercase text-gray-400">Conversão total</p>
        <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {conversaoPct === null ? "—" : `${conversaoPct.toFixed(1)}%`}
        </p>
      </div>
      {!temVisitas ? (
        <p className="py-8 text-center text-sm text-gray-400">Sem dados de visitas para o período selecionado.</p>
      ) : (
        <>
          <svg viewBox={`0 0 ${largura} 200`} className="w-full" style={{ maxHeight: 160 }}>
            <path d={path} fill={cor} fillOpacity={0.4} stroke={cor} strokeOpacity={0.8} strokeWidth={1.5} />
          </svg>
          <div className="mt-2 flex items-start justify-between">
            <div>
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cor }} />
                <p className="text-xs uppercase text-gray-400">Visitas únicas</p>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatarNumeroFunil(visitas)}</p>
            </div>
            <div className="text-right">
              <div className="mb-0.5 flex items-center justify-end gap-1.5">
                <p className="text-xs uppercase text-gray-400">Vendas brutas</p>
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cor }} />
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{formatarNumeroFunil(vendasQtd)}</p>
              <p className="text-xs text-gray-400">{formatarMoedaFunil(vendasValor, moeda)}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
