import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { reconcileBooking } from "@/lib/payment-reconciliation";
import { isJsonRequest, sameOrigin } from "@/lib/security";

export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const input = await request.json() as { reference?: string };
  let references: string[];
  if (input.reference) references = [input.reference.trim().toUpperCase()];
  else {
    const rows = await getDb().select({ reference: bookings.reference }).from(bookings).where(and(eq(bookings.paymentMethod, "stripe"), inArray(bookings.paymentStatus, ["pending", "processing"]))).orderBy(asc(bookings.createdAt)).limit(20);
    references = rows.map((row) => row.reference);
  }
  const results: Array<{ reference: string; status: string }> = [];
  for (const reference of references) {
    try {
      const result = await reconcileBooking(reference, "admin");
      results.push({ reference, status: result.status });
    } catch {
      results.push({ reference, status: "provider_unavailable" });
    }
  }
  return NextResponse.json({ checked: results.length, results });
}
