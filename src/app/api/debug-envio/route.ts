import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/mercadolivre/token";

const ML_API = "https://api.mercadolibre.com";
const CONTA_ID = "5407b9d6-2acb-4e17-b080-d743fed1e75d";
const ORDER_ID = 2000017840088248;

export async function GET() {
  const accessToken = await getValidAccessToken(CONTA_ID);

  const resOrder = await fetch(`${ML_API}/orders/${ORDER_ID}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const order = await resOrder.json();

  const resShip = await fetch(`${ML_API}/orders/${ORDER_ID}/shipments`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const shipment = await resShip.json();

  let history: unknown = null;
  if (shipment?.id) {
    const resHist = await fetch(`${ML_API}/shipments/${shipment.id}/history`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (resHist.ok) history = await resHist.json();
  }

  let claims: unknown = null;
  const resClaims = await fetch(
    `${ML_API}/post-purchase/v1/claims/search?resource_id=${ORDER_ID}&resource=order`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (resClaims.ok) claims = await resClaims.json();

  return NextResponse.json({
    orderStatus: order?.status,
    orderTags: order?.tags,
    shipmentStatus: shipment?.status,
    shipmentSubstatus: shipment?.substatus,
    shipmentId: shipment?.id,
    history,
    claims,
  });
}
