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
  const { data: contas } = await admin.from("ml_accounts").select("id").limit(1);
  const conta = contas?.[0];
  if (!conta) return NextResponse.json({ error: "no account" }, { status: 404 });

  const accessToken = await getValidAccessToken(conta.id);

  const advRes = await fetch(`https://api.mercadolibre.com/advertising/advertisers?product_id=PADS`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Api-Version": "1" },
  });
  const advData = (await advRes.json()) as {
    advertisers?: { advertiser_id: number; site_id: string }[];
  };
  const adv = advData.advertisers?.[0];
  if (!adv) return NextResponse.json({ error: "sem anunciante", advData });

  const campRes = await fetch(
    `https://api.mercadolibre.com/advertising/${adv.site_id}/advertisers/${adv.advertiser_id}/product_ads/campaigns/search?limit=50&offset=0`,
    { headers: { Authorization: `Bearer ${accessToken}`, "api-version": "2" } }
  );
  const campData = await campRes.text();

  return NextResponse.json({
    advertiserId: adv.advertiser_id,
    siteId: adv.site_id,
    campStatus: campRes.status,
    campData: campData.slice(0, 2000),
  });
}
