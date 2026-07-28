import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import {
  getTotaisPorStatus,
  getProdutosMaisVendidos,
  getSerieDiariaVendas,
  periodoDeDatas,
} from "@/lib/mercadolivre/orders";
import { getTotalVisitas, getSerieDiariaVisitas } from "@/lib/mercadolivre/visits";
import { getPerguntasNaoRespondidas } from "@/lib/mercadolivre/questions";
import { getMensagensNaoLidas } from "@/lib/mercadolivre/messages";
import {
  PRESETS,
  type PresetKey,
  periodoDoPreset,
  periodoMesAnterior,
  variacaoPercentual,
} from "@/lib/date-utils";
import ResumoInterativo from "./resumo-interativo";
import ResumoFiltros from "./resumo-filtros";
import MetaWidget from "./meta-widget";
import { AoVivoProvider } from "./ao-vivo-context";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { getValidAccessToken as getValidAccessTokenAmazon } from "@/lib/amazon/token";
import {
  getVendas as getVendasAmazon,
  periodoDeDatas as periodoDeDatasAmazon,
  classificarCancelados as classificarCanceladosAmazon,
} from "@/lib/amazon/orders";

// A pagina Resumo consolida Mercado Livre + Amazon. Por decisao explicita do
// escopo da integracao Amazon (so vendas e faturamento agregados, o resto
// fica dentro do proprio Seller Central), a Amazon so entra nos cards de
// "Vendas brutas" / "Quantidade de vendas", no filtro de contas, no grafico
// de linha e na pizza de participacao -- ela NAO entra em Visualizacoes,
// Conversao, Produtos mais vendidos, Pos-venda nem Vendas ao vivo (nenhuma
// dessas metricas existe hoje na integracao Amazon).
export const maxDuration = 60;

const formatarMoeda = (valor: number, moeda: string | null) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: moeda ?? "BRL",
  }).format(valor);

// Agrupa os pedidos Amazon (que vem como lista crua) em uma serie diaria no
// mesmo formato que o Mercado Livre ja usa no grafico -- sem precisar de
// nenhuma chamada extra a API, ja que os pedidos completos do periodo ja
// foram buscados em getVendasAmazon.
function agruparPedidosAmazonPorDia(
  pedidos: { dataCriacao: string; valor: number }[]
): { data: string; quantidade: number; valor: number }[] {
  const mapa = new Map<string, { quantidade: number; valor: number }>();
  for (const p of pedidos) {
    // Ajusta pro fuso de Brasilia (-03:00) antes de extrair o dia, mesma
    // convencao usada no restante da integracao Amazon.
    const dataLocal = new Date(new Date(p.dataCriacao).getTime() - 3 * 60 * 60 * 1000);
    const chave = dataLocal.toISOString().slice(0, 10);
    const atual = mapa.get(chave) ?? { quantidade: 0, valor: 0 };
    atual.quantidade += 1;
    atual.valor += p.valor;
    mapa.set(chave, atual);
  }
  return Array.from(mapa.entries()).map(([data, v]) => ({ data, ...v }));
}

export default async function ResumoPage({
  searchParams,
}: {
  searchParams: Promise<{
    periodo?: string;
    de?: string;
    ate?: string;
    conectado?: string;
    erro?: string;
    contas?: string;
  }>;
}) {
  const { isAdmin } = await exigirAcessoSecao("resumo");
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const hoje = new Date();
  const presetSelecionado = (params.periodo as PresetKey) ?? "7dias";
  const isPersonalizado = presetSelecionado === "personalizado" && params.de && params.ate;

  const { de, ate } = isPersonalizado
    ? { de: params.de!, ate: params.ate! }
    : periodoDoPreset(presetSelecionado, hoje);

  const periodoAtual = periodoDeDatas(de, ate);
  const { de: deAnterior, ate: ateAnterior } = periodoMesAnterior(de, ate);
  const periodoAnterior = periodoDeDatas(deAnterior, ateAnterior);

  const { data: contasMLRaw } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname, apelido, cor")
    .order("nickname", { ascending: true });
  const contasML = contasMLRaw ?? [];

  const { data: contasAmazonRaw } = await supabase
    .from("amazon_accounts")
    .select("id, seller_id, marketplace_id, nickname, apelido, cor")
    .order("nickname", { ascending: true });
  const contasAmazon = contasAmazonRaw ?? [];

  const todasContasIdsML = contasML.map((c) => c.id);
  const todasContasIds = [...todasContasIdsML, ...contasAmazon.map((c) => c.id)];
  const idsSelecionados = params.contas
    ? params.contas.split(",").filter((id) => todasContasIds.includes(id))
    : todasContasIds;

  const contasFiltradas = contasML.filter((c) => idsSelecionados.includes(c.id));
  const contasAmazonFiltradas = contasAmazon.filter((c) => idsSelecionados.includes(c.id));

  const resultados = await Promise.all(
    contasFiltradas.map(async (conta) => {
      try {
        const accessToken = await getValidAccessToken(conta.id);
        const [
          pagas,
          canceladas,
          visitas,
          produtos,
          pagasAnterior,
          canceladasAnterior,
          visitasAnterior,
          perguntas,
          mensagens,
          serieVendasAtual,
          serieVisitasAtual,
          serieVendasAnterior,
          serieVisitasAnterior,
        ] = await Promise.all([
          getTotaisPorStatus(accessToken, conta.ml_user_id, periodoAtual, "paid"),
          getTotaisPorStatus(accessToken, conta.ml_user_id, periodoAtual, "cancelled"),
          getTotalVisitas(accessToken, conta.ml_user_id, de, ate),
          getProdutosMaisVendidos(accessToken, conta.ml_user_id, periodoAtual),
          getTotaisPorStatus(accessToken, conta.ml_user_id, periodoAnterior, "paid"),
          getTotaisPorStatus(accessToken, conta.ml_user_id, periodoAnterior, "cancelled"),
          getTotalVisitas(accessToken, conta.ml_user_id, deAnterior, ateAnterior),
          getPerguntasNaoRespondidas(accessToken, conta.ml_user_id, conta.id, nomeConta(conta)),
          getMensagensNaoLidas(accessToken, conta.id, nomeConta(conta)),
          getSerieDiariaVendas(accessToken, conta.ml_user_id, periodoAtual),
          getSerieDiariaVisitas(accessToken, conta.ml_user_id, de, ate),
          getSerieDiariaVendas(accessToken, conta.ml_user_id, periodoAnterior),
          getSerieDiariaVisitas(accessToken, conta.ml_user_id, deAnterior, ateAnterior),
        ]);
        return {
          conta,
          pagas,
          canceladas,
          visitas,
          produtos,
          pagasAnterior,
          canceladasAnterior,
          visitasAnterior,
          perguntas,
          mensagens,
          serieVendasAtual,
          serieVisitasAtual,
          serieVendasAnterior,
          serieVisitasAnterior,
          erro: null as string | null,
        };
      } catch (err) {
        console.error(`Erro ao buscar resumo de ${conta.nickname}:`, err);
        return {
          conta,
          pagas: null,
          canceladas: null,
          visitas: 0,
          produtos: [],
          pagasAnterior: null,
          canceladasAnterior: null,
          visitasAnterior: 0,
          perguntas: { total: 0, perguntas: [] },
          mensagens: { conversas: [], totalMensagens: 0 },
          serieVendasAtual: [],
          serieVisitasAtual: [],
          serieVendasAnterior: [],
          serieVisitasAnterior: [],
          erro: "Falha ao buscar dados desta conta.",
        };
      }
    })
  );

  // Vendas Amazon do periodo atual e anterior, para entrar nos totais
  // consolidados / grafico / pizza junto com o Mercado Livre. Reaproveita
  // periodoDeDatas da Amazon (que ja trata o limite de "nao pode cair no
  // futuro" da SP-API).
  const periodoAtualAmazon = periodoDeDatasAmazon(de, ate);
  const periodoAnteriorAmazon = periodoDeDatasAmazon(deAnterior, ateAnterior);

  const resultadosAmazon = await Promise.all(
    contasAmazonFiltradas.map(async (conta) => {
      try {
        const accessToken = await getValidAccessTokenAmazon(conta.id);
        const [vendasAtual, vendasAnterior] = await Promise.all([
          getVendasAmazon(
            accessToken,
            conta.marketplace_id as string,
            periodoAtualAmazon,
            conta.id,
            conta.nickname as string
          ),
          getVendasAmazon(
            accessToken,
            conta.marketplace_id as string,
            periodoAnteriorAmazon,
            conta.id,
            conta.nickname as string
          ),
        ]);
        const cancelados = classificarCanceladosAmazon(vendasAtual.pedidos);
        return {
          conta,
          vendasAtual,
          vendasAnterior,
          cancelados,
          erro: null as string | null,
        };
      } catch (err) {
        console.error(`Erro ao buscar resumo Amazon de ${conta.nickname}:`, err);
        return {
          conta,
          vendasAtual: null,
          vendasAnterior: null,
          cancelados: null,
          erro: "Falha ao buscar dados desta conta.",
        };
      }
    })
  );

  // "Vendas brutas" soma pedidos pagos + pedidos cancelados no período (o
  // cancelamento e informativo, nao e descontado do total bruto) -- essa
  // parte bate com o painel real do Mercado Livre. POREM o valor de cada
  // pedido aqui usa total_amount (produto), sem somar o frete pago pelo
  // comprador -- decisao explicita do usuario: o faturamento do dashboard
  // deve refletir so o que a empresa recebe pelo produto, nao o frete
  // adicional pago pelo cliente. Por isso este numero pode ficar menor que
  // o "Vendas brutas" mostrado na propria plataforma do ML quando ha
  // pedidos com frete pago pelo comprador -- isso e esperado.
  const faturamentoTotalML =
    resultados.reduce((s, r) => s + (r.pagas?.valor ?? 0), 0) +
    resultados.reduce((s, r) => s + (r.canceladas?.valor ?? 0), 0);
  const vendasTotaisML =
    resultados.reduce((s, r) => s + (r.pagas?.quantidade ?? 0), 0) +
    resultados.reduce((s, r) => s + (r.canceladas?.quantidade ?? 0), 0);
  const canceladosTotalML = resultados.reduce((s, r) => s + (r.canceladas?.quantidade ?? 0), 0);

  const faturamentoAnteriorML =
    resultados.reduce((s, r) => s + (r.pagasAnterior?.valor ?? 0), 0) +
    resultados.reduce((s, r) => s + (r.canceladasAnterior?.valor ?? 0), 0);
  const vendasAnterioresML =
    resultados.reduce((s, r) => s + (r.pagasAnterior?.quantidade ?? 0), 0) +
    resultados.reduce((s, r) => s + (r.canceladasAnterior?.quantidade ?? 0), 0);

  // Vendas brutas Amazon = todos os pedidos do periodo (pagos + cancelados),
  // mesmo criterio ja usado para o Mercado Livre.
  const faturamentoTotalAmazon = resultadosAmazon.reduce((s, r) => s + (r.vendasAtual?.valorSomado ?? 0), 0);
  const vendasTotaisAmazon = resultadosAmazon.reduce((s, r) => s + (r.vendasAtual?.totalPedidos ?? 0), 0);
  const canceladosTotalAmazon = resultadosAmazon.reduce((s, r) => s + (r.cancelados?.quantidade ?? 0), 0);
  const faturamentoAnteriorAmazon = resultadosAmazon.reduce((s, r) => s + (r.vendasAnterior?.valorSomado ?? 0), 0);
  const vendasAnterioresAmazon = resultadosAmazon.reduce((s, r) => s + (r.vendasAnterior?.totalPedidos ?? 0), 0);

  const faturamentoTotal = faturamentoTotalML + faturamentoTotalAmazon;
  const vendasTotais = vendasTotaisML + vendasTotaisAmazon;
  const canceladosTotal = canceladosTotalML + canceladosTotalAmazon;
  const faturamentoAnterior = faturamentoAnteriorML + faturamentoAnteriorAmazon;
  const vendasAnteriores = vendasAnterioresML + vendasAnterioresAmazon;

  // Visualizacoes e conversao continuam exclusivas do Mercado Livre -- a
  // integracao Amazon (fase atual) nao traz dado de visitas.
  const visitasTotais = resultados.reduce((s, r) => s + r.visitas, 0);
  const moeda = resultados.find((r) => r.pagas?.moeda)?.pagas?.moeda
    ?? resultadosAmazon.find((r) => r.vendasAtual?.moeda)?.vendasAtual?.moeda
    ?? "BRL";
  const conversao = visitasTotais > 0 ? (vendasTotais / visitasTotais) * 100 : 0;

  const visitasAnteriores = resultados.reduce((s, r) => s + r.visitasAnterior, 0);
  const conversaoAnterior = visitasAnteriores > 0 ? (vendasAnteriores / visitasAnteriores) * 100 : 0;

  const perguntasNaoRespondidas = resultados.reduce((s, r) => s + r.perguntas.total, 0);
  const mensagensNovas = resultados.reduce((s, r) => s + r.mensagens.conversas.length, 0);
  const mensagensNaoRespondidas = resultados.reduce((s, r) => s + r.mensagens.totalMensagens, 0);

  // Produtos mais vendidos consolidado entre todas as contas (chave por
  // conta+item, ja que o mesmo id de anuncio pode existir em contas diferentes).
  // Continua exclusivo do Mercado Livre (a Amazon nao envia dado de anuncio
  // nesta fase, por decisao de escopo).
  const produtosConsolidados = resultados
    .flatMap((r) =>
      r.produtos.map((p) => ({ ...p, contaNickname: nomeConta(r.conta) }))
    )
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 5);

  const contasParaGrafico = [
    ...resultados.map((r) => ({
      id: r.conta.id,
      nickname: nomeConta(r.conta),
      cor: r.conta.cor ?? COR_PADRAO,
    })),
    ...resultadosAmazon.map((r) => ({
      id: r.conta.id,
      nickname: nomeConta(r.conta),
      cor: r.conta.cor ?? COR_PADRAO,
    })),
  ];

  const seriesPorContaML = Object.fromEntries(
    resultados.map((r) => [
      r.conta.id,
      {
        atual: { vendas: r.serieVendasAtual, visitas: r.serieVisitasAtual },
        anterior: { vendas: r.serieVendasAnterior, visitas: r.serieVisitasAnterior },
      },
    ])
  );

  const seriesPorContaAmazon = Object.fromEntries(
    resultadosAmazon.map((r) => [
      r.conta.id,
      {
        atual: {
          vendas: agruparPedidosAmazonPorDia(r.vendasAtual?.pedidos ?? []),
          visitas: [] as { data: string; total: number }[],
        },
        anterior: {
          vendas: agruparPedidosAmazonPorDia(r.vendasAnterior?.pedidos ?? []),
          visitas: [] as { data: string; total: number }[],
        },
      },
    ])
  );

  const seriesPorConta = { ...seriesPorContaML, ...seriesPorContaAmazon };

  const pizza = [
    ...resultados
      .map((r) => ({
        contaId: r.conta.id,
        nickname: nomeConta(r.conta),
        cor: r.conta.cor ?? COR_PADRAO,
        valor: (r.pagas?.valor ?? 0) + (r.canceladas?.valor ?? 0),
      }))
      .filter((f) => f.valor > 0),
    ...resultadosAmazon
      .map((r) => ({
        contaId: r.conta.id,
        nickname: nomeConta(r.conta),
        cor: r.conta.cor ?? COR_PADRAO,
        valor: r.vendasAtual?.valorSomado ?? 0,
      }))
      .filter((f) => f.valor > 0),
  ];

  const totalContasConectadas = contasML.length + contasAmazon.length;
  const contasSelecionadasNomes = [...contasFiltradas, ...contasAmazonFiltradas].map((c) => nomeConta(c));

  return (
    <div className="mx-auto max-w-6xl p-6">
      {params.conectado && (
        <p className="mb-4 rounded bg-green-50 p-3 text-sm text-green-700 dark:bg-green-950 dark:text-green-300">
          Conta &quot;{params.conectado}&quot; conectada com sucesso.
        </p>
      )}
      {params.erro && (
        <p className="mb-4 rounded bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
          {params.erro}
        </p>
      )}

      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)] dark:text-white">Resumo</h1>
      <p className="mb-4 text-sm text-gray-500">
        {idsSelecionados.length === todasContasIds.length
          ? `Consolidado de todas as ${totalContasConectadas} contas conectadas`
          : `Mostrando: ${contasSelecionadasNomes.join(", ")}`}
      </p>

      <AoVivoProvider contaIds={idsSelecionados.filter((id) => todasContasIdsML.includes(id))}>
        <MetaWidget isAdmin={isAdmin} />

        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <Link
                key={p.key}
                href={`/dashboard?periodo=${p.key}`}
                className={`rounded-full border px-3 py-1 text-xs ${
                  presetSelecionado === p.key
                    ? "border-[var(--color-sixxis-navy)] bg-[var(--color-sixxis-navy)] text-white"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {p.label}
              </Link>
            ))}
          </div>

          <form className="flex items-end gap-2">
            <input type="hidden" name="periodo" value="personalizado" />
            <div>
              <label className="mb-1 block text-xs text-gray-500">De</label>
              <input
                type="date"
                name="de"
                defaultValue={de}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Até</label>
              <input
                type="date"
                name="ate"
                defaultValue={ate}
                className="rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              Período personalizado
            </button>
          </form>
        </div>

        <ResumoFiltros
          todasContas={[
            ...contasML.map((c) => ({ id: c.id, nickname: nomeConta(c), cor: c.cor ?? COR_PADRAO })),
            ...contasAmazon.map((c) => ({ id: c.id, nickname: nomeConta(c), cor: c.cor ?? COR_PADRAO })),
          ]}
          contasSelecionadas={idsSelecionados}
        />

        <p className="mb-4 text-xs text-gray-400">
          Período: {new Date(de + "T00:00:00").toLocaleDateString("pt-BR")} até{" "}
          {new Date(ate + "T00:00:00").toLocaleDateString("pt-BR")} · comparado com{" "}
          {new Date(deAnterior + "T00:00:00").toLocaleDateString("pt-BR")} até{" "}
          {new Date(ateAnterior + "T00:00:00").toLocaleDateString("pt-BR")}
        </p>

        <ResumoInterativo
          cards={{
            vendasBrutas: { valor: faturamentoTotal, variacaoPct: variacaoPercentual(faturamentoTotal, faturamentoAnterior) },
            quantidadeVendas: { valor: vendasTotais, variacaoPct: variacaoPercentual(vendasTotais, vendasAnteriores) },
            visualizacoes: { valor: visitasTotais, variacaoPct: variacaoPercentual(visitasTotais, visitasAnteriores) },
            conversao: { valor: conversao, variacaoPct: variacaoPercentual(conversao, conversaoAnterior) },
          }}
          moeda={moeda ?? "BRL"}
          periodo={{ de, ate, deAnterior, ateAnterior }}
          contas={contasParaGrafico}
          seriesPorConta={seriesPorConta}
          pizza={pizza}
        />
      </AoVivoProvider>

      {(contasAmazon.length > 0) && (
        <p className="mb-8 -mt-4 text-xs text-gray-400">
          Visualizações e conversão consideram só as contas Mercado Livre (a integração Amazon cobre vendas e
          faturamento; o restante é gerenciado direto no Seller Central).
        </p>
      )}

      {canceladosTotal > 0 && (
        <p className="mb-8 text-xs text-gray-500">
          {canceladosTotal} pedido(s) cancelado(s) no período (
          <Link href="/dashboard/vendas" className="underline">
            ver detalhes em Vendas
          </Link>
          )
        </p>
      )}

      <h2 className="mb-2 text-sm font-semibold text-gray-700">Produtos mais vendidos</h2>
      {produtosConsolidados.length === 0 ? (
        <p className="mb-8 text-sm text-gray-400">Nenhuma venda paga no período selecionado.</p>
      ) : (
        <ul className="mb-8 divide-y divide-gray-200 rounded border border-gray-200 bg-white">
          {produtosConsolidados.map((p) => (
            <li key={`${p.contaNickname}-${p.itemId}`} className="flex items-center justify-between p-3 text-sm">
              <div>
                <p className="font-medium text-gray-800">{p.titulo}</p>
                <p className="text-xs text-gray-400">{p.contaNickname}</p>
              </div>
              <div className="text-right">
                <p className="font-medium text-gray-800">{p.quantidade} un.</p>
                <p className="text-xs text-gray-400">{formatarMoeda(p.valor, moeda)}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 text-sm font-semibold text-gray-700">Pós-venda</h2>
      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/dashboard/pos-venda"
          className="rounded border border-gray-200 bg-white p-4 hover:bg-gray-50"
        >
          <p className="text-xs uppercase text-gray-400">Perguntas não respondidas</p>
          <p className="text-xl font-bold text-gray-900">{perguntasNaoRespondidas}</p>
        </Link>
        <Link
          href="/dashboard/pos-venda"
          className="rounded border border-gray-200 bg-white p-4 hover:bg-gray-50"
        >
          <p className="text-xs uppercase text-gray-400">Conversas com mensagens novas</p>
          <p className="text-xl font-bold text-gray-900">{mensagensNovas}</p>
        </Link>
        <Link
          href="/dashboard/pos-venda"
          className="rounded border border-gray-200 bg-white p-4 hover:bg-gray-50"
        >
          <p className="text-xs uppercase text-gray-400">Mensagens não respondidas</p>
          <p className="text-xl font-bold text-gray-900">{mensagensNaoRespondidas}</p>
        </Link>
      </div>

      {(resultados.some((r) => r.erro) || resultadosAmazon.some((r) => r.erro)) && (
        <ul className="mb-4 text-xs text-red-500">
          {resultados
            .filter((r) => r.erro)
            .map((r) => (
              <li key={r.conta.id}>
                {nomeConta(r.conta)}: {r.erro}
              </li>
            ))}
          {resultadosAmazon
            .filter((r) => r.erro)
            .map((r) => (
              <li key={r.conta.id}>
                {nomeConta(r.conta)} (Amazon): {r.erro}
              </li>
            ))}
        </ul>
      )}

      {contasML.length === 0 && contasAmazon.length === 0 && (
        <div className="rounded border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500">
          Nenhuma conta conectada ainda. Use &quot;+ Conectar conta&quot; no topo da página.
        </div>
      )}
    </div>
  );
}
