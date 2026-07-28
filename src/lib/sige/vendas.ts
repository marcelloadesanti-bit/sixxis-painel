import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { getTotaisPorStatus, getCanceladosClassificados, periodoDeDatas } from "@/lib/mercadolivre/orders";
import { getValidAccessToken as getValidAccessTokenAmazon } from "@/lib/amazon/token";
import {
  getVendas as getVendasAmazon,
  classificarCancelados,
  periodoDeDatas as periodoDeDatasAmazon,
} from "@/lib/amazon/orders";

// Agregacao de vendas por conta (ML, Amazon ou canal manual) para um periodo
// livre -- usada tanto pelo relatorio sob demanda (api/sige/relatorio) quanto
// pelo Fechamento Mensal (api/sige/fechamento), que precisa dos mesmos
// numeros "ao vivo" no momento de congelar o periodo. Extraida para um lugar
// so para as duas rotas nunca divergirem no criterio de calculo.
export type ItemVendas = {
  id: string;
  tipo: "ml" | "amazon" | "manual";
  contaRef: string;
  nome: string;
  cor: string;
  vendasBrutas: number;
  faturamentoBruto: number;
  vendasCanceladas: number;
  valorCancelado: number;
  vendasDevolvidas: number;
  valorDevolvido: number;
  vendasLiquidas: number;
  faturamentoLiquido: number;
  erro?: string;
};

export const VENDAS_ZERADO = {
  vendasBrutas: 0,
  faturamentoBruto: 0,
  vendasCanceladas: 0,
  valorCancelado: 0,
  vendasDevolvidas: 0,
  valorDevolvido: 0,
  vendasLiquidas: 0,
  faturamentoLiquido: 0,
};

export function somarItensVendas(itens: ItemVendas[]) {
  return itens.reduce(
    (acc, i) => ({
      vendasBrutas: acc.vendasBrutas + i.vendasBrutas,
      faturamentoBruto: acc.faturamentoBruto + i.faturamentoBruto,
      vendasCanceladas: acc.vendasCanceladas + i.vendasCanceladas,
      valorCancelado: acc.valorCancelado + i.valorCancelado,
      vendasDevolvidas: acc.vendasDevolvidas + i.vendasDevolvidas,
      valorDevolvido: acc.valorDevolvido + i.valorDevolvido,
      vendasLiquidas: acc.vendasLiquidas + i.vendasLiquidas,
      faturamentoLiquido: acc.faturamentoLiquido + i.faturamentoLiquido,
    }),
    { ...VENDAS_ZERADO }
  );
}

// Busca vendas brutas/liquidas/canceladas/devolvidas por conta, no periodo
// (de/ate, formato YYYY-MM-DD), para ML + Amazon. `idsFiltro`, se informado,
// e uma lista de ids no formato "ml:<uuid>" / "amazon:<uuid>" -- quando
// omitido, busca todas as contas. Canais manuais NAO entram aqui (nao tem
// API para consultar "ao vivo") -- ver canais_manuais_lancamentos para os
// valores ja lancados manualmente.
export async function buscarVendasMlAmazon(
  de: string,
  ate: string,
  idsFiltro: string[] | null
): Promise<ItemVendas[]> {
  const admin = createAdminClient();
  const querConta = (prefixo: string, id: string) => !idsFiltro || idsFiltro.includes(`${prefixo}:${id}`);

  const [{ data: contasMl }, { data: contasAmazon }] = await Promise.all([
    admin.from("ml_accounts").select("id, nickname, apelido, cor, ml_user_id"),
    admin.from("amazon_accounts").select("id, nickname, apelido, cor, marketplace_id"),
  ]);

  const periodoMl = periodoDeDatas(de, ate);
  const periodoAmazon = periodoDeDatasAmazon(de, ate);
  const itens: ItemVendas[] = [];

  await Promise.all([
    ...(contasMl ?? [])
      .filter((c) => querConta("ml", c.id))
      .map(async (c) => {
        try {
          const token = await getValidAccessToken(c.id);
          const [pagas, canceladas, classificacao] = await Promise.all([
            getTotaisPorStatus(token, c.ml_user_id, periodoMl, "paid"),
            getTotaisPorStatus(token, c.ml_user_id, periodoMl, "cancelled"),
            getCanceladosClassificados(token, c.ml_user_id, periodoMl),
          ]);
          itens.push({
            id: `ml:${c.id}`,
            tipo: "ml",
            contaRef: c.id,
            nome: c.apelido || c.nickname,
            cor: c.cor ?? "#64748b",
            vendasBrutas: pagas.quantidade + canceladas.quantidade,
            faturamentoBruto: pagas.valor + canceladas.valor,
            vendasCanceladas: classificacao.canceladosPuros.quantidade,
            valorCancelado: classificacao.canceladosPuros.valor,
            vendasDevolvidas: classificacao.devolvidos.quantidade,
            valorDevolvido: classificacao.devolvidos.valor,
            vendasLiquidas: pagas.quantidade,
            faturamentoLiquido: pagas.valor,
          });
        } catch (err) {
          itens.push({
            id: `ml:${c.id}`,
            tipo: "ml",
            contaRef: c.id,
            nome: c.apelido || c.nickname,
            cor: c.cor ?? "#64748b",
            ...VENDAS_ZERADO,
            erro: err instanceof Error ? err.message : "Falha ao buscar dados desta conta.",
          });
        }
      }),
    ...(contasAmazon ?? [])
      .filter((c) => querConta("amazon", c.id))
      .map(async (c) => {
        try {
          const token = await getValidAccessTokenAmazon(c.id);
          const vendas = await getVendasAmazon(
            token,
            c.marketplace_id as string,
            periodoAmazon,
            c.id,
            c.nickname as string
          );
          const cancelados = classificarCancelados(vendas.pedidos);
          itens.push({
            id: `amazon:${c.id}`,
            tipo: "amazon",
            contaRef: c.id,
            nome: c.apelido || c.nickname,
            cor: c.cor ?? "#64748b",
            vendasBrutas: vendas.totalPedidos,
            faturamentoBruto: vendas.valorSomado,
            vendasCanceladas: cancelados.quantidade,
            valorCancelado: cancelados.valor,
            vendasDevolvidas: 0,
            valorDevolvido: 0,
            vendasLiquidas: vendas.totalPedidos - cancelados.quantidade,
            faturamentoLiquido: vendas.valorSomado - cancelados.valor,
          });
        } catch (err) {
          itens.push({
            id: `amazon:${c.id}`,
            tipo: "amazon",
            contaRef: c.id,
            nome: c.apelido || c.nickname,
            cor: c.cor ?? "#64748b",
            ...VENDAS_ZERADO,
            erro: err instanceof Error ? err.message : "Falha ao buscar dados desta conta.",
          });
        }
      }),
  ]);

  itens.sort((a, b) => a.nome.localeCompare(b.nome));
  return itens;
}

// Soma os lancamentos manuais (canais_manuais_lancamentos) de um canal cujo
// periodo lancado se sobrepoe ao periodo pedido (de/ate).
export async function buscarVendasManuais(de: string, ate: string, idsFiltro: string[] | null): Promise<ItemVendas[]> {
  const admin = createAdminClient();
  const querConta = (id: string) => !idsFiltro || idsFiltro.includes(`manual:${id}`);

  const { data: canais } = await admin.from("canais_manuais").select("id, nome, apelido, cor").eq("ativo", true);

  const itens: ItemVendas[] = [];
  await Promise.all(
    (canais ?? [])
      .filter((c) => querConta(c.id))
      .map(async (c) => {
        const { data: lancamentos } = await admin
          .from("canais_manuais_lancamentos")
          .select(
            "vendas_brutas, faturamento_bruto, vendas_canceladas, valor_cancelado, vendas_devolvidas, valor_devolvido"
          )
          .eq("canal_id", c.id)
          .lte("periodo_de", ate)
          .gte("periodo_ate", de);

        const soma = (lancamentos ?? []).reduce(
          (acc, l) => ({
            vendasBrutas: acc.vendasBrutas + (l.vendas_brutas ?? 0),
            faturamentoBruto: acc.faturamentoBruto + Number(l.faturamento_bruto ?? 0),
            vendasCanceladas: acc.vendasCanceladas + (l.vendas_canceladas ?? 0),
            valorCancelado: acc.valorCancelado + Number(l.valor_cancelado ?? 0),
            vendasDevolvidas: acc.vendasDevolvidas + (l.vendas_devolvidas ?? 0),
            valorDevolvido: acc.valorDevolvido + Number(l.valor_devolvido ?? 0),
          }),
          { vendasBrutas: 0, faturamentoBruto: 0, vendasCanceladas: 0, valorCancelado: 0, vendasDevolvidas: 0, valorDevolvido: 0 }
        );

        itens.push({
          id: `manual:${c.id}`,
          tipo: "manual",
          contaRef: c.id,
          nome: c.apelido || c.nome,
          cor: c.cor ?? "#64748b",
          ...soma,
          vendasLiquidas: soma.vendasBrutas - soma.vendasCanceladas - soma.vendasDevolvidas,
          faturamentoLiquido: soma.faturamentoBruto - soma.valorCancelado - soma.valorDevolvido,
        });
      })
  );

  itens.sort((a, b) => a.nome.localeCompare(b.nome));
  return itens;
}
