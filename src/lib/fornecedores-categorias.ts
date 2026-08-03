// Categorias fixas de fornecedores (Fase 14, 03/08/2026). Extraido de
// lib/fornecedores.ts para um arquivo proprio, SEM nenhum import de
// "@/lib/supabase/server" -- fornecedores-painel.tsx (Client Component)
// precisa do valor CATEGORIAS_FORNECEDOR em runtime (para montar o
// <select> e as 3 secoes da pagina), e importar qualquer coisa de
// lib/fornecedores.ts como valor (nao apenas `import type`) puxaria o
// modulo inteiro -- incluindo createClient() de supabase/server, que usa
// next/headers e so pode rodar em Server Components/Server Actions.
export const CATEGORIAS_FORNECEDOR = ["Ar e ventilação", "Fitness", "Outros"] as const;
export type CategoriaFornecedor = (typeof CATEGORIAS_FORNECEDOR)[number];
