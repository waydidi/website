import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { promoCodes } from "@/db/schema";

// Active promotions marked for the homepage (public details only).
export async function GET() {
  try {
    const now = Date.now();
    const rows = await getDb().select().from(promoCodes).where(and(eq(promoCodes.status, "active"), eq(promoCodes.showOnHomepage, true)));
    const promotions = rows
      .filter((p) => (!p.startsAt || new Date(p.startsAt).getTime() <= now) && (!p.endsAt || new Date(p.endsAt).getTime() >= now))
      .map((p) => ({
        code: p.code,
        title: p.title,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        service: p.service,
        minFare: p.minFare,
        discountType: p.discountType,
        discountValue: p.discountValue,
        maxDiscount: p.maxDiscount,
        firstBookingOnly: p.firstBookingOnly,
        perCustomerLimit: p.perCustomerLimit,
        offerTerms: (() => { try { return JSON.parse(p.offerTermsJson ?? "[]") as string[]; } catch { return []; } })(),
      }));
    return NextResponse.json({ promotions }, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch {
    return NextResponse.json({ promotions: [] });
  }
}
