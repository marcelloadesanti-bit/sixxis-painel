// Cadastro de fornecedores (Fase 14, 03/08/2026). Fonte: tabela
// public.fornecedores (Supabase). Independente da secao Estoque -- usado
// tambem para popular o seletor de fornecedor no formulario de Containers
// (em vez de digitar o nome manualmente a cada pedido).

import { createClient } from "@/lib/supabase/server";

export const CATEGORIAS_FORNECEDOR = ["Ar e ventilação", "Fitness", "Outros"] as const;
export type CategoriaFornecedor = (typeof CATEGORIAS_FORNECEDOR)[number];

export type Fornecedor = {
  id: string;
  categoria: CategoriaFornecedor;
  nome: string;
  localizacao: string | null;
  cnpj: string | null;
  representanteComercial: string | null;
  linhaProdutos: string | null;
  ativo: boolean;
  criadoEm: string;
};

type LinhaFornecedorRaw = {
  id: string;
  categoria: string;
  nome: string;
  localizacao: string | null;
  cnpj: string | null;
  representante_comercial: string | null;
  linha_produtos: string | null;
  ativo: boolean;
  criado_em: string;
};

function mapearLinha(row: LinhaFornecedorRaw): Fornecedor {
  return {
    id: row.id,
    categoria: row.categoria as CategoriaFornecedor,
    nome: row.nome,
    localizacao: row.localizacao,
    cnpj: row.cnpj,
    representanteComercial: row.representante_comercial,
    linhaProdutos: row.linha_produtos,
    ativo: row.ativo,
    criadoEm: row.criado_em,
  };
}

// Lista todos os fornecedores (ativos e inativos), ordenados por categoria e
// depois por nome. Usada na pagina de gestao (aba Fornecedores).
export async function listarFornecedores(): Promise<Fornecedor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fornecedores")
    .select("*")
    .order("categoria", { ascending: true })
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

// Agrupa a lista de fornecedores pelas 3 categorias fixas, na ordem definida
// em CATEGORIAS_FORNECEDOR. Usada para renderizar a pagina em secoes.
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
