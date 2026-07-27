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
import { getFaturamentoConta, type PeriodoFaturamento, type ResumoFaturamento } from "./billing";

const IDADE_MAXIMA_CACHE_MS = 12 * 60 * 60 * 1000; // 12h

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

async function buscarEAtualizarCache(
  admin: ReturnType<typeof createAdminClient>,
  contaId: string,
  accessToken: string,
  mlUserId: number
): Promise<{ resultado: FaturamentoContaResultado; erro429: boolean }> {
  try {
    const dados = await getFaturamentoConta(accessToken, mlUserId);
    const agora = new Date().toISOString();

    if (!dados) {
      await admin
        .from("faturamento_cache")
        .upsert(
          { conta_id: contaId, periodo_key: null, dados: null, status: "sem_periodo", erro: null, atualizado_em: agora },
          { onConflict: "conta_id" }
        );
      return {
        resultado: { status: "sem_periodo", desatualizado: false, atualizadoEm: agora, deCache: false },
        erro429: false,
      };
    }

    await admin.from("faturamento_cache").upsert(
      {
        conta_id: contaId,
        periodo_key: dados.periodo.key,
        dados: dados as unknown as Record<string, unknown>,
        status: "ok",
        erro: null,
        atualizado_em: agora,
      },
      { onConflict: "conta_id" }
    );

    return {
      resultado: {
        status: "ok",
        periodo: dados.periodo,
        resumo: dados.resumo,
        desatualizado: false,
        atualizadoEm: agora,
        deCache: false,
      },
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

// Busca (com cache) o faturamento de uma conta. `permitirBusca=false` impede
// qualquer chamada real à API do ML mesmo com cache expirado/forçado -- usado
// pela página para respeitar o orçamento de tempo de execução da Vercel (ver
// LIMITE_BUSCAS_AO_VIVO_POR_CARGA em page.tsx). Nesse caso devolvemos o
// último cache conhecido (marcado desatualizado) ou um status "pendente" se
// nunca houve cache.
export async function getFaturamentoContaCacheado(
  contaId: string,
  accessToken: string,
  mlUserId: number,
  { forcar = false, permitirBusca = true }: { forcar?: boolean; permitirBusca?: boolean } = {}
): Promise<FaturamentoContaResultado> {
  const admin = createAdminClient();

  const { data: cache } = await admin
    .from("faturamento_cache")
    .select("periodo_key, dados, status, erro, atualizado_em")
    .eq("conta_id", contaId)
    .maybeSingle();

  const idadeMs = cache ? Date.now() - new Date(cache.atualizado_em).getTime() : Infinity;
  const cacheValido = !!cache && idadeMs < IDADE_MAXIMA_CACHE_MS;

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

  const { resultado } = await buscarEAtualizarCache(admin, contaId, accessToken, mlUserId);

  if (resultado.status === "erro" && cache && cache.status === "ok" && cache.dados) {
    // Preferimos mostrar o ultimo dado bom conhecido a estourar erro na tela.
    return montarResultadoDoCache(cache as LinhaCache, true);
  }

  if (resultado.status === "erro") {
    await admin
      .from("faturamento_cache")
      .upsert(
        { conta_id: contaId, periodo_key: null, dados: null, status: "erro", erro: resultado.erro, atualizado_em: new Date().toISOString() },
        { onConflict: "conta_id" }
      );
  }

  return resultado;
}
