import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { lerEstoquePlanilha } from "@/lib/estoque/planilha";
import {
  calcularVelocidadePorSku,
  projetarDiasAteRuptura,
  classificarRisco,
  LEAD_TIME_DIAS,
  JANELA_VELOCIDADE_DIAS,
} from "@/lib/estoque/metricas";
import EstoquePainel, { type LinhaEstoque } from "./estoque-painel";

export const maxDuration = 300;

export default async function EstoquePage() {
  const { podeEditar } = await exigirAcessoSecao("estoque");

  const supabase = await createClient();

  const { data: contasRaw } = await supabase.from("ml_accounts").select("id, ml_user_id");

  const contasComToken = await Promise.all(
    (contasRaw ?? []).map(async (c) => {
      try {
        const accessToken = await getValidAccessToken(c.id as string);
        return { id: c.id as string, mlUserId: String(c.ml_user_id), accessToken };
      } catch (err) {
        console.error(`Erro ao obter token da conta ${c.id}:`, err);
        return null;
      }
    })
  );
  const contasValidas = contasComToken.filter((c): c is NonNullable<typeof c> => c !== null);

  const [itensPlanilha, velocidadePorSku, configRaw] = await Promise.all([
    lerEstoquePlanilha(),
    calcularVelocidadePorSku(contasValidas),
    supabase.from("estoque_sku_config").select("sku, data_chegada"),
  ]);

  const dataChegadaPorSku = new Map<string, string | null>();
  for (const row of configRaw.data ?? []) {
    dataChegadaPorSku.set((row.sku as string).trim().toUpperCase(), row.data_chegada as string | null);
  }

  const linhas: LinhaEstoque[] = itensPlanilha.map((item) => {
    const chave = item.sku.trim().toUpperCase();
    const quantidade60d = velocidadePorSku.get(chave) ?? 0;
    const diasAteRuptura = projetarDiasAteRuptura(item.saldoTotal, quantidade60d);
    return {
      ...item,
      quantidade60d,
      velocidadeDiaria: Math.round((quantidade60d / JANELA_VELOCIDADE_DIAS) * 100) / 100,
      diasAteRuptura,
      nivel: classificarRisco(diasAteRuptura),
      dataChegada: dataChegadaPorSku.get(chave) ?? null,
    };
  });

  // Ordena por urgencia: menor prazo ate ruptura primeiro; SKUs sem venda no
  // periodo (sem projecao possivel) ficam por ultimo.
  linhas.sort((a, b) => {
    if (a.diasAteRuptura === null && b.diasAteRuptura === null) return 0;
    if (a.diasAteRuptura === null) return 1;
    if (b.diasAteRuptura === null) return -1;
    return a.diasAteRuptura - b.diasAteRuptura;
  });

  const categorias = Array.from(new Set(linhas.map((l) => l.categoria).filter(Boolean))).sort();

  const consolidado = {
    totalSkus: linhas.length,
    saldoTotal: linhas.reduce((s, l) => s + l.saldoTotal, 0),
    criticos: linhas.filter((l) => l.nivel === "critico").length,
    atencao: linhas.filter((l) => l.nivel === "atencao").length,
    semDataChegada: linhas.filter((l) => !l.dataChegada).length,
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Estoque</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Dados lidos diretamente da planilha "CONTROLE DE ESTOQUE SIXXIS" (somente leitura — o painel nunca altera a
        planilha) cruzados com a velocidade de venda dos últimos {JANELA_VELOCIDADE_DIAS} dias. Risco de ruptura
        considera um lead time de compra de {LEAD_TIME_DIAS} dias.
      </p>

      <EstoquePainel linhas={linhas} categorias={categorias} consolidado={consolidado} podeEditar={podeEditar} />
    </div>
  );
}
