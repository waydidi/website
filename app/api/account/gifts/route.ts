import { NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { listMemberGifts } from "@/lib/gifts";

// The signed-in member's badge gifts (issues any newly earned ones first).
export async function GET(request: Request) {
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ gifts: [] }, { headers: { "Cache-Control": "private, no-store" } });
  const gifts = await listMemberGifts(session.customer.id).catch(() => []);
  return NextResponse.json({ gifts }, { headers: { "Cache-Control": "private, no-store" } });
}
