import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: contas } = await admin
    .from("ml_accounts")
    .select("id, ml_user_id, nickname")
    .limit(1);

  const conta = contas?.[0];
  if (!conta) return NextResponse.json({ error: "no account" }, { status: 404 });

  const accessToken = await getValidAccessToken(conta.id);
  const resultado: Record<string, unknown> = {};

  async function chamar(nome: string, url: string, init?: RequestInit) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { Authorization: `Bearer ${accessToken}`, ...(init?.headers ?? {}) },
      });
      const corpo = await res.text();
      resultado[nome] = { status: res.status, corpo: corpo.slice(0, 1000) };
    } catch (err) {
      resultado[nome] = { erro: String(err) };
    }
  }

  // 1) achar advertiser
  await chamar("advertisers", `https://api.mercadolibre.com/advertising/advertisers?product_id=PADS`, {
    headers: { "Api-Version": "1" },
  });
  const advResult = resultado["advertisers"] as { status: number; corpo: string };
  let advertiserId: number | null = null;
  let siteId: string | null = null;
  if (advResult?.status === 200) {
    const parsed = JSON.parse(advResult.corpo);
    advertiserId = parsed.advertisers?.[0]?.advertiser_id ?? null;
    siteId = parsed.advertisers?.[0]?.site_id ?? null;
  }

  if (advertiserId && siteId) {
    // 2) listar campanhas para achar uma de baixo risco (a de "Ticket baixo" com custo 0, ou qualquer pausada)
    await chamar(
      "campanhas",
      `https://api.mercadolibre.com/advertising/${siteId}/advertisers/${advertiserId}/product_ads/campaigns/search?limit=50&offset=0&date_from=2026-07-01&date_to=2026-07-23&metrics=cost&metrics_summary=true`,
      { headers: { "api-version": "2" } }
    );
    const campResult = resultado["campanhas"] as { status: number; corpo: string };
    if (campResult?.status === 200) {
      const parsed = JSON.parse(campResult.corpo);
      const campanhas = parsed.results as { id: number; name: string; status: string; budget: number }[];
      resultado["campanhas_resumo"] = campanhas.map((c) => ({ id: c.id, name: c.name, status: c.status, budget: c.budget }));

      const alvo = campanhas.find((c) => c.name === "Ticket baixo 06/10") ?? campanhas[0];
      if (alvo) {
        // 3) teste NO-OP: GET detalhe da campanha (nao muda nada)
        await chamar(
          "detalhe_campanha",
          `https://api.mercadolibre.com/advertising/${siteId}/product_ads/campaigns/${alvo.id}`,
          { headers: { "api-version": "2" } }
        );

        // 4) teste de escrita NO-OP: reenviar o MESMO status que a campanha ja tem
        await chamar(
          "put_status_noop",
          `https://api.mercadolibre.com/advertising/${siteId}/product_ads/campaigns/${alvo.id}`,
          {
            method: "PUT",
            headers: { "api-version": "2", "Content-Type": "application/json" },
            body: JSON.stringify({ status: alvo.status }),
          }
        );
      }
    }
  }

  return NextResponse.json({ contaId: conta.id, advertiserId, siteId, resultado });
}
