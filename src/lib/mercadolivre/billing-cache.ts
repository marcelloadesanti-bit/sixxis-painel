// Camada de cache para a API de Faturamento (Billing) do Mercado Livre.
//
// Motivo: a API aplica rate limit de 5 requisicoes por minuto (compartilhado
// entre as contas), e a propria documentacao do ML recomenda nao consultar
// esse endpoint repetidamente -- "a informacao nao se modifica durante o
// dia, portanto um consumo diario por usuario e suficiente". Por isso
// guardamos o resultado por conta na tabela faturamento_cache e so batemos
// na API de novo quando o cache expira (ou quando o usuario forca
// atualizacao pelo botao "Atualizar").
//
// Em caso de 429 (rate limit) com um cache antigo disponivel, preferimos
// servir o dado desatualizado a mostrar erro -- o valor de faturamento
// raramente muda de uma hora para outra.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getFaturamentoConta,
  getResumoFaturamento,
  type PeriodoFaturamento,
  type ResumoFaturamento,
} from "./billing";

const IDADE_MAXIMA_CACHE_MS = 12 * 60 * 60 * 1000; // 12h

// Chave de cache usada para o periodo "atual" (o mais recente, que ainda
// pode mudar -- por isso tem TTL de 12h). Um mes anterior explicitamente
// selecionado pelo usuario usa sua propria key real (ex: "2026-06-01") como
// chave de cache e NUNCA expira, porque periodos fechados nao mudam mais.
const CHAVE_PERIODO_ATUAL = "ATUAL";

export type FaturamentoContaResultado = (
  | { status: "ok"; periodo: PeriodoFaturamento; resumo: ResumoFaturamento; desatualizado: boolean; atualizadoEm: string }
  | { status: "sem_periodo"; desatualizado: boolean; atualizadoEm: string | null }
  | { status: "erro"; erro: string; desatualizado: boolean; atualizadoEm: string | null }
) & { deCache: boolean };

type LinhaCache = {
  periodo_key: string | null;
  dados: unknown;
  status: string;
  erro: string | null;
  atualizado_em: string;
};

function montarResultadoDoCache(cache: LinhaCache, forcarDesatualizado = false): FaturamentoContaResultado {
  const idadeMs = Date.now() - new Date(cache.atualizado_em).getTime();
  const desatualizado = forcarDesatualizado || idadeMs >= IDADE_MAXIMA_CACHE_MS;

  if (cache.status === "sem_periodo") {
    return { status: "sem_periodo", desatualizado, atualizadoEm: cache.atualizado_em, deCache: true };
  }
  if (cache.status === "erro" || !cache.dados) {
    return {
      status: "erro",
      erro: cache.erro ?? "Falha ao buscar faturamento desta conta.",
      desatualizado,
      atualizadoEm: cache.atualizado_em,
      deCache: true,
    };
  }
  const dados = cache.dados as { periodo: PeriodoFaturamento; resumo: ResumoFaturamento };
  return {
    status: "ok",
    periodo: dados.periodo,
    resumo: dados.resumo,
    desatualizado,
    atualizadoEm: cache.atualizado_em,
    deCache: true,
  };
}

// Busca dados novos na API do ML e grava no cache sob `chaveCache`.
// - Sem `periodoKeyExplicito`: comportamento original -- descobre o periodo
//   mais recente e o resumo (2 chamadas), grava sob CHAVE_PERIODO_ATUAL.
// - Com `periodoKeyExplicito` (mes anterior escolhido pelo usuario): busca
//   direto o resumo daquele periodo (1 chamada so, mais barato -- nao
//   precisa descobrir "qual e o periodo mais recente", ja sabemos a key).
async function buscarEAtualizarCache(
  admin: ReturnType<typeof createAdminClient>,
  contaId: string,
  accessToken: string,
  mlUserId: number,
  periodoKeyExplicito: string | undefined,
  chaveCache: string
): Promise<{ resultado: FaturamentoContaResultado; erro429: boolean }> {
  try {
    let periodo: PeriodoFaturamento | null;
    let resumo: ResumoFaturamento | null;

    if (periodoKeyExplicito) {
      resumo = await getResumoFaturamento(accessToken, periodoKeyExplicito);
      periodo = resumo
        ? {
            key: resumo.periodoKey,
            dataInicio: resumo.dataInicio,
            dataFim: resumo.dataFim,
            valor: resumo.totalCobrado,
            valorPendente: resumo.totalDivida,
            status: "CLOSED",
          }
        : null;
    } else {
      const dados = await getFaturamentoConta(accessToken, mlUserId);
      periodo = dados?.periodo ?? null;
      resumo = dados?.resumo ?? null;
    }

    const agora = new Date().toISOString();

    if (!periodo || !resumo) {
      await admin
        .from("faturamento_cache")
        .upsert(
          { conta_id: contaId, periodo_key: chaveCache, dados: null, status: "sem_periodo", erro: null, atualizado_em: agora },
          { onConflict: "conta_id,periodo_key" }
        );
      return {
        resultado: { status: "sem_periodo", desatualizado: false, atualizadoEm: agora, deCache: false },
        erro429: false,
      };
    }

    const dados = { periodo, resumo };
    await admin.from("faturamento_cache").upsert(
      {
        conta_id: contaId,
        periodo_key: chaveCache,
        dados: dados as unknown as Record<string, unknown>,
        status: "ok",
        erro: null,
        atualizado_em: agora,
      },
      { onConflict: "conta_id,periodo_key" }
    );

    return {
      resultado: { status: "ok", periodo, resumo, desatualizado: false, atualizadoEm: agora, deCache: false },
      erro429: false,
    };
  } catch (err) {
    const mensagem = err instanceof Error ? err.message : "Falha desconhecida ao buscar faturamento.";
    return {
      resultado: { status: "erro", erro: mensagem, desatualizado: false, atualizadoEm: null, deCache: false },
      erro429: mensagem.includes("(429)"),
    };
  }
}

// Busca (com cache) o faturamento de uma conta.
// - `periodoKey` ausente: periodo mais recente (o "atual"), cache com TTL de
//   12h -- comportamento original.
// - `periodoKey` presente (ex: "2026-06-01"): mes anterior explicitamente
//   escolhido pelo usuario no seletor. Esse periodo esta fechado e nao muda
//   mais, entao uma vez que tenhamos um resultado bom (ok ou sem_periodo) no
//   cache, nunca mais precisamos rebuscar -- so com `forcar`.
// `permitirBusca=false` impede qualquer chamada real à API do ML mesmo com
// cache expirado/forçado -- usado pela página para respeitar o orçamento de
// tempo de execução da Vercel (ver LIMITE_BUSCAS_AO_VIVO_POR_CARGA em
// page.tsx). Nesse caso devolvemos o último cache conhecido (marcado
// desatualizado) ou um status "pendente" se nunca houve cache.
export async function getFaturamentoContaCacheado(
  contaId: string,
  accessToken: string,
  mlUserId: number,
  { forcar = false, permitirBusca = true, periodoKey }: { forcar?: boolean; permitirBusca?: boolean; periodoKey?: string } = {}
): Promise<FaturamentoContaResultado> {
  const admin = createAdminClient();
  const chaveCache = periodoKey ?? CHAVE_PERIODO_ATUAL;
  const historico = !!periodoKey;

  const { data: cache } = await admin
    .from("faturamento_cache")
    .select("periodo_key, dados, status, erro, atualizado_em")
    .eq("conta_id", contaId)
    .eq("periodo_key", chaveCache)
    .maybeSingle();

  let cacheValido: boolean;
  if (historico) {
    // Periodo fechado: um resultado bom (ok ou sem_periodo) vale para sempre.
    cacheValido = !!cache && (cache.status === "ok" || cache.status === "sem_periodo");
  } else {
    const idadeMs = cache ? Date.now() - new Date(cache.atualizado_em).getTime() : Infinity;
    cacheValido = !!cache && idadeMs < IDADE_MAXIMA_CACHE_MS;
  }

  if (cacheValido && !forcar) {
    return montarResultadoDoCache(cache as LinhaCache);
  }

  if (!permitirBusca) {
    if (cache) return montarResultadoDoCache(cache as LinhaCache, true);
    return {
      status: "erro",
      erro: 'Ainda não foi possível carregar esta conta (limite de contas por carregamento, para respeitar o rate limit do Mercado Livre). Clique em "Atualizar" novamente em alguns segundos.',
      desatualizado: true,
      atualizadoEm: null,
      deCache: false,
    };
  }

  const { resultado } = await buscarEAtualizarCache(admin, contaId, accessToken, mlUserId, periodoKey, chaveCache);

  if (resultado.status === "erro" && cache && cache.status === "ok" && cache.dados) {
    // Preferimos mostrar o ultimo dado bom conhecido a estourar erro na tela.
    return montarResultadoDoCache(cache as LinhaCache, true);
  }

  if (resultado.status === "erro") {
    await admin
      .from("faturamento_cache")
      .upsert(
        { conta_id: contaId, periodo_key: chaveCache, dados: null, status: "erro", erro: resultado.erro, atualizado_em: new Date().toISOString() },
        { onConflict: "conta_id,periodo_key" }
      );
  }

  return resultado;
}
