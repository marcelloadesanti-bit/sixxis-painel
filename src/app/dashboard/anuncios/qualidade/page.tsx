import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { COR_PADRAO, nomeConta } from "@/lib/account-colors";
import {
  contarAnunciosAtivos,
  lerCacheQualidade,
  listarAnunciosAtivos,
  montarConsolidado,
  type QualidadeAnuncio,
} from "@/lib/mercadolivre/qualidade";
import QualidadePainel, { type ContaQualidade, type ItemExpandido } from "./qualidade-painel";

export default async function CentralQualidadePage({
  searchParams,
}: {
  searchParams: Promise<{ contas?: string; expandir?: string }>;
}) {
  await exigirAcessoSecao("anuncios", "qualidade");
  const params = await searchParams;

  const supabase = await createClient();
  const { data: contasRaw } = await supabase
    .from("ml_accounts")
    .select("id, ml_user_id, nickname, apelido, cor")
    .order("nickname", { ascending: true });

  const todasContas = (contasRaw ?? []).map((c) => ({
    id: c.id as string,
    ml_user_id: String(c.ml_user_id),
    nickname: nomeConta({ nickname: c.nickname as string, apelido: c.apelido as string | null }),
    cor: (c.cor as string) ?? COR_PADRAO,
  }));

  const idsSelecionados = params.contas ? params.contas.split(",").filter(Boolean) : todasContas.map((c) => c.id);
  const contasSelecionadas = todasContas.filter((c) => idsSelecionados.includes(c.id));
  const contasParaBusca = contasSelecionadas.length > 0 ? contasSelecionadas : todasContas;

  // Cache inteiro (zero chamadas ao ML) -- leitura barata, agrupa por conta.
  const cacheMapa = await lerCacheQualidade(supabase);
  const cachePorConta = new Map<string, QualidadeAnuncio[]>();
  for (const item of cacheMapa.values()) {
    if (!cachePorConta.has(item.contaId)) cachePorConta.set(item.contaId, []);
    cachePorConta.get(item.contaId)!.push(item);
  }

  // Contagem de anuncios ativos por conta -- 1 chamada leve por conta
  // (paging.total, sem bulk detail), segura mesmo com varias contas.
  const contasComDados: ContaQualidade[] = await Promise.all(
    contasParaBusca.map(async (conta) => {
      let ativos = 0;
      let accessToken = "";
      try {
        accessToken = await getValidAccessToken(conta.id);
        ativos = await contarAnunciosAtivos(accessToken, conta.ml_user_id);
      } catch (err) {
        console.error(`Erro ao contar anuncios ativos da conta ${conta.id}:`, err);
      }
      const cacheDaConta = cachePorConta.get(conta.id) ?? [];
      return {
        id: conta.id,
        mlUserId: conta.ml_user_id,
        nickname: conta.nickname,
        cor: conta.cor,
        consolidado: montarConsolidado(cacheDaConta, ativos),
      };
    })
  );

  const cacheDasSelecionadas = contasParaBusca.flatMap((c) => cachePorConta.get(c.id) ?? []);
  const ativosTotalSelecionadas = contasComDados.reduce((s, c) => s + c.consolidado.ativos, 0);
  const consolidadoGeral = montarConsolidado(cacheDasSelecionadas, ativosTotalSelecionadas);

  // So busca a lista detalhada (bulk, com titulo/thumbnail) da conta
  // expandida no momento -- nunca de todas de uma vez.
  let itensExpandidos: ItemExpandido[] = [];
  let erroExpandir: string | null = null;
  if (params.expandir) {
    const contaExpandida = contasParaBusca.find((c) => c.id === params.expandir);
    if (contaExpandida) {
      try {
        const accessToken = await getValidAccessToken(contaExpandida.id);
        const ativos = await listarAnunciosAtivos(accessToken, contaExpandida.ml_user_id);
        const cacheDaConta = cachePorConta.get(contaExpandida.id) ?? [];
        const cacheMapaConta = new Map(cacheDaConta.map((c) => [c.itemId, c]));
        itensExpandidos = ativos
          .map((a) => ({ ...a, qualidade: cacheMapaConta.get(a.id) ?? null }))
          .sort((a, b) => {
            const scoreA = a.qualidade?.score ?? -1;
            const scoreB = b.qualidade?.score ?? -1;
            return scoreA - scoreB;
          });
      } catch (err) {
        console.error(`Erro ao listar anuncios ativos da conta ${params.expandir}:`, err);
        erroExpandir = "Não foi possível carregar os anúncios ativos desta conta agora.";
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Central de Qualidade</h1>
      <p className="mb-6 text-sm text-gray-500">
        Score oficial do Mercado Livre por anúncio e status de disputa de catálogo. A consulta nunca acontece em
        massa automaticamente — só quando você clica em "Consultar score" ou "Verificar mais 20", e sempre restrita a
        anúncios ativos.
      </p>

      <QualidadePainel
        todasContas={todasContas}
        contasSelecionadas={idsSelecionados}
        contas={contasComDados}
        consolidadoGeral={consolidadoGeral}
        contaExpandida={params.expandir ?? null}
        itensExpandidos={itensExpandidos}
        erroExpandir={erroExpandir}
      />
    </div>
  );
}
