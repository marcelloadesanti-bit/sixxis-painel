// Categorias fixas de fornecedores (Fase 14, 03/08/2026; ampliado 04/08/2026
// com Aspiradores de po e Samples). Extraido para arquivo proprio, SEM
// nenhum import de "@/lib/supabase/server" -- fornecedores-painel.tsx
// (Client Component) precisa do valor CATEGORIAS_FORNECEDOR em runtime (para
// montar o <select> e os badges dos cards), e importar qualquer coisa de
// lib/fornecedores.ts como valor (nao apenas `import type`) puxaria o
// modulo inteiro -- incluindo createClient() de supabase/server, que usa
// next/headers e so pode rodar em Server Components/Server Actions.
//
// Categoria e apenas um campo de informacao no cadastro (usado para badge e
// filtro futuro) -- a pagina de Fornecedores NAO e mais dividida em secoes
// por categoria.
export const CATEGORIAS_FORNECEDOR = [
  "Ar e ventilação",
  "Fitness",
  "Aspiradores de pó",
  "Samples",
  "Outros",
] as const;
export type CategoriaFornecedor = (typeof CATEGORIAS_FORNECEDOR)[number];
