import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente Supabase com a Service Role Key - ignora RLS.
// Uso restrito a rotas de servidor (API routes) que precisam gravar dados
// de sistema (ex: salvar token de uma conta Mercado Livre) independente
// das politicas de RLS do usuario logado.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
