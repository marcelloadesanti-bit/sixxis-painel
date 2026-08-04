// Cadastro de fornecedores (Fase 14, 03/08/2026; campos telefone/estrela e
// listagem em cards adicionados 04/08/2026; latitude/longitude para o mapa
// adicionados 04/08/2026; skus para metricas por fornecedor -- Fase 16 --
// adicionados 04/08/2026; apelido para selecao rapida em Containers
// adicionado 04/08/2026). Fonte: tabela public.fornecedores (Supabase).
// Independente da secao Estoque -- usado tambem para popular o seletor de
// fornecedor no formulario de Containers (em vez de digitar o nome
// manualmente a cada pedido).
//
// Convencao de skus: sempre que o produto tiver variacao de voltagem (ex:
// CLI-SX040-110 / CLI-SX040-220), cadastrar apenas o SKU "pai", sem o
// sufixo de voltagem (ex: CLI-SX040). A Fase 16 (metricas de fornecedores
// por SKU) vai casar por prefixo contra os SKUs reais vendidos, entao um
// unico SKU pai cobre todas as variacoes automaticamente.
//
// As categorias fixas (CATEGORIAS_FORNECEDOR / CategoriaFornecedor) moraram
// aqui inicialmente, mas foram extraidas para fornecedores-categorias.ts:
// este arquivo importa createClient() de "@/lib/supabase/server" (depende
// de next/headers, so roda em Server Components/Server Actions), e o
// Client Component fornecedores-painel.tsx precisa do valor das categorias
// em runtime -- importar qualquer valor daqui pelo browser quebraria o
// build. Reexportamos os dois abaixo para nao quebrar quem ja importava
// daqui.

import { createClient } from "@/lib/supabase/server";
import { CATEGORIAS_FORNECEDOR, type CategoriaFornecedor } from "@/lib/fornecedores-categorias";

export { CATEGORIAS_FORNECEDOR };
export type { CategoriaFornecedor };

export type Fornecedor = {
  id: string;
  categoria: CategoriaFornecedor;
  nome: string;
  apelido: string | null;
  telefone: string | null;
  localizacao: string | null;
  cnpj: string | null;
  representanteComercial: string | null;
  linhaProdutos: string | null;
  skus: string[];
  ativo: boolean;
  estrela: boolean;
  latitude: number | null;
  longitude: number | null;
  geocodificadoEm: string | null;
  criadoEm: string;
};

type LinhaFornecedorRaw = {
  id: string;
  categoria: string;
  nome: string;
  apelido: string | null;
  telefone: string | null;
  localizacao: string | null;
  cnpj: string | null;
  representante_comercial: string | null;
  linha_produtos: string | null;
  skus: string[] | null;
  ativo: boolean;
  estrela: boolean;
  latitude: number | null;
  longitude: number | null;
  geocodificado_em: string | null;
  criado_em: string;
};

function mapearLinha(row: LinhaFornecedorRaw): Fornecedor {
  return {
    id: row.id,
    categoria: row.categoria as CategoriaFornecedor,
    nome: row.nome,
    apelido: row.apelido,
    telefone: row.telefone,
    localizacao: row.localizacao,
    cnpj: row.cnpj,
    representanteComercial: row.representante_comercial,
    linhaProdutos: row.linha_produtos,
    skus: row.skus ?? [],
    ativo: row.ativo,
    estrela: row.estrela,
    latitude: row.latitude,
    longitude: row.longitude,
    geocodificadoEm: row.geocodificado_em,
    criadoEm: row.criado_em,
  };
}

// Nome curto para exibir em selects e listagens compactas (ex: seletor de
// fornecedor em Containers) -- usa o apelido quando cadastrado, senao cai
// no nome completo.
export function nomeExibicao(f: Pick<Fornecedor, "nome" | "apelido">): string {
  return f.apelido?.trim() || f.nome;
}

// Lista todos os fornecedores (ativos e inativos). A pagina de gestao (aba
// Fornecedores) ordena localmente (estrela > ativo > nome), entao aqui basta
// ordenar por nome para ter uma base estavel.
export async function listarFornecedores(): Promise<Fornecedor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornecedores")
    .select("*")
    .order("nome", { ascending: true });

  if (error) {
    console.error("Erro ao listar fornecedores:", error);
    return [];
  }

  return ((data ?? []) as LinhaFornecedorRaw[]).map(mapearLinha);
}

// Lista apenas fornecedores ativos, ordenados por nome. Usada para popular o
// seletor de fornecedor no formulario de Containers.
export async function listarFornecedoresAtivos(): Promise<Fornecedor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornecedores")
    .select("*")
    .eq("ativo", true)
    .order("nome", { ascending: true });

  if (error) {
    console.error("Erro ao listar fornecedores ativos:", error);
    return [];
  }

  return ((data ?? []) as LinhaFornecedorRaw[]).map(mapearLinha);
}

// Agrupa a lista de fornecedores pelas categorias fixas. Nao e mais usada
// para estruturar a pagina de Fornecedores (que agora e uma lista unica de
// cards), mas fica disponivel para uso futuro (ex: filtros, relatorios).
export function agruparPorCategoria(fornecedores: Fornecedor[]): Record<CategoriaFornecedor, Fornecedor[]> {
  const grupos = Object.fromEntries(CATEGORIAS_FORNECEDOR.map((c) => [c, [] as Fornecedor[]])) as Record<
    CategoriaFornecedor,
    Fornecedor[]
  >;
  for (const f of fornecedores) {
    if (grupos[f.categoria]) {
      grupos[f.categoria].push(f);
    } else {
      grupos.Outros.push(f);
    }
  }
  return grupos;
}
