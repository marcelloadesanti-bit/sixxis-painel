// Controle manual de pedidos de importacao / containers (Fase 13, 03/08/2026).
// Fonte: tabela public.estoque_containers (Supabase). Substitui a antiga
// planilha externa "Pedidos Containers" -- todo o CRUD agora acontece direto
// pelo painel (aba Containers), sem depender de planilha nenhuma.
//
// fornecedorId (Fase 14, 04/08/2026): vinculo opcional com a tabela
// fornecedores (FK fornecedor_id, nullable). Quando o pedido e lancado
// selecionando um fornecedor cadastrado, o texto livre "fornecedor" continua
// sendo preenchido (para exibicao/robustez), mas fornecedorId permite no
// futuro (Fase 16) cruzar containers com metricas por fornecedor. Pedidos
// antigos ou lancados com fornecedor digitado manualmente ficam com
// fornecedorId nulo.

import { createClient } from "@/lib/supabase/server";

export type PedidoContainer = {
  id: string;
  fatura: string | null;
  fornecedor: string;
  fornecedorId: string | null;
  sku: string;
  quantidade: number;
  dataEmbarque: string | null;
  dataPrevChegada: string | null;
  dataChegada: string | null;
  pago: boolean;
  observacoes: string | null;
  criadoEm: string;
};

type LinhaContainerRaw = {
  id: string;
  fatura: string | null;
  fornecedor: string;
  fornecedor_id: string | null;
  sku: string;
  quantidade: number;
  data_embarque: string | null;
  data_prev_chegada: string | null;
  data_chegada: string | null;
  pago: boolean;
  observacoes: string | null;
  criado_em: string;
};

function mapearLinha(row: LinhaContainerRaw): PedidoContainer {
  return {
    id: row.id,
    fatura: row.fatura,
    fornecedor: row.fornecedor,
    fornecedorId: row.fornecedor_id,
    sku: row.sku,
    quantidade: row.quantidade,
    dataEmbarque: row.data_embarque,
    dataPrevChegada: row.data_prev_chegada,
    dataChegada: row.data_chegada,
    pago: row.pago,
    observacoes: row.observacoes,
    criadoEm: row.criado_em,
  };
}

// Lista todos os pedidos de container cadastrados, mais recentes primeiro
// dentro de quem ainda nao tem previsao de chegada, e por previsao de
// chegada (mais proxima primeiro) para os demais.
export async function listarContainers(): Promise<PedidoContainer[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("estoque_containers")
    .select("*")
    .order("data_prev_chegada", { ascending: true, nullsFirst: false })
    .order("criado_em", { ascending: false });

  if (error) {
    console.error("Erro ao listar estoque_containers:", error);
    return [];
  }

  return ((data ?? []) as LinhaContainerRaw[]).map(mapearLinha);
}

// Agrupa por SKU apenas os pedidos que AINDA NAO CHEGARAM (data_chegada
// nula) -- sao esses que devem compensar a projecao de ruptura em
// metricas.ts. Pedidos com data_chegada preenchida ja devem estar refletidos
// no saldo lido da planilha ESTOQUE, entao entram na contagem de "chegaram"
// mas nao na simulacao de ruptura (senao a quantidade seria contada 2x).
export function containersPendentesPorSku(
  containers: PedidoContainer[]
): Map<string, { quantidade: number; dataPrevChegada: string | null }[]> {
  const mapa = new Map<string, { quantidade: number; dataPrevChegada: string | null }[]>();
  for (const c of containers) {
    if (c.dataChegada) continue;
    const chave = c.sku.trim().toUpperCase();
    const lista = mapa.get(chave) ?? [];
    lista.push({ quantidade: c.quantidade, dataPrevChegada: c.dataPrevChegada });
    mapa.set(chave, lista);
  }
  return mapa;
}
