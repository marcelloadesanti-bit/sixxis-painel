import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { exigirAcessoSecao } from "@/lib/permissoes-guard";
import { lerEstoquePlanilha } from "@/lib/estoque/planilha";
import { listarContainers, containersPendentesPorSku } from "@/lib/estoque/containers";
import {
  calcularVelocidadePorSku,
  projetarRupturaComContainers,
  classificarRisco,
  LEAD_TIME_DIAS,
  JANELA_VELOCIDADE_DIAS,
} from "@/lib/estoque/metricas";
import MetricasEstoquePainel, { type LinhaMetrica } from "./metricas-painel";

// force-dynamic: o saldo da planilha, a velocidade de venda e os containers
// mudam a todo momento -- nunca deixar o Next.js servir um render em cache
// (Full Route Cache) desta pagina.
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

export default async function MetricasEstoquePage() {
  await exigirAcessoSecao("estoque", "estoque_metricas");

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

  const [itensPlanilha, velocidadePorSku, containers] = await Promise.all([
    lerEstoquePlanilha(),
    calcularVelocidadePorSku(contasValidas),
    listarContainers(),
  ]);

  const pendentesPorSku = containersPendentesPorSku(containers);

  const linhas: LinhaMetrica[] = itensPlanilha.map((item) => {
    const chave = item.sku.trim().toUpperCase();
    const quantidade60d = velocidadePorSku.get(chave) ?? 0;
    const velocidadeDiaria = Math.round((quantidade60d / JANELA_VELOCIDADE_DIAS) * 100) / 100;
    const { diasAteRuptura, proximaChegada } = projetarRupturaComContainers(
      item.saldoTotal,
      quantidade60d / JANELA_VELOCIDADE_DIAS,
      pendentesPorSku.get(chave) ?? []
    );
    return {
      ...item,
      quantidade60d,
      velocidadeDiaria,
      diasAteRuptura,
      nivel: classificarRisco(diasAteRuptura),
      proximaChegada,
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
  };

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-1 text-2xl font-bold text-[var(--color-sixxis-navy)]">Métricas de estoque</h1>
      <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
        Velocidade de venda dos últimos {JANELA_VELOCIDADE_DIAS} dias cruzada com o saldo atual (aba Estoque) e com
        os pedidos de container ainda não chegados (aba Containers). Risco de ruptura considera um lead time de
        compra de {LEAD_TIME_DIAS} dias.
      </p>
      <MetricasEstoquePainel linhas={linhas} categorias={categorias} consolidado={consolidado} />
    </div>
  );
}
