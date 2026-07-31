"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";
import { consultarQualidade, verificarLoteQualidade } from "@/lib/mercadolivre/qualidade";

function voltarPara(contas: string, expandir: string): string {
  const params = new URLSearchParams();
  if (contas) params.set("contas", contas);
  if (expandir) params.set("expandir", expandir);
  const query = params.toString();
  return `/dashboard/anuncios/qualidade${query ? `?${query}` : ""}`;
}

// Consulta o score de UM anuncio (botao individual "Consultar score").
// Sem checagem de nivel de edicao -- consultar o score do proprio ML nao
// altera nada no anuncio, e um diagnostico, entao fica liberado para
// leitura tambem (mesmo espirito de "Detalhamento por estado e SKU").
export async function consultarScoreAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const itemId = String(formData.get("itemId"));
  const contaId = String(formData.get("contaId"));
  const contas = String(formData.get("contas") ?? "");
  const expandir = String(formData.get("expandir") ?? "");

  const accessToken = await getValidAccessToken(contaId);
  await consultarQualidade(supabase, accessToken, itemId, contaId);

  revalidatePath("/dashboard/anuncios/qualidade");
  redirect(voltarPara(contas, expandir));
}

// Verifica ate 20 anuncios ATIVOS ainda nao cacheados da conta (botao
// "Verificar mais 20" no accordion).
export async function verificarLoteAction(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const contaId = String(formData.get("contaId"));
  const sellerId = String(formData.get("sellerId"));
  const contas = String(formData.get("contas") ?? "");
  const expandir = String(formData.get("expandir") ?? "");

  const accessToken = await getValidAccessToken(contaId);
  await verificarLoteQualidade(supabase, accessToken, sellerId, contaId, 20);

  revalidatePath("/dashboard/anuncios/qualidade");
  redirect(voltarPara(contas, expandir));
}
