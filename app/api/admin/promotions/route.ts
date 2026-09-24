import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { promoInputSchema, savePromotion } from "@/lib/promo-admin";
import { isJsonRequest, sameOrigin } from "@/lib/security";

// Admin-only: create or update a promotion.
export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const parsed = promoInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message ?? "Check the form.", field: issue?.path.join(".") }, { status: 400 });
  }
  const result = await savePromotion(parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
  console.info("Admin saved promotion", { id: result.id, code: parsed.data.code, admin: admin.email });
  return NextResponse.json({ ok: true, id: result.id }, { headers: { "Cache-Control": "no-store" } });
}
