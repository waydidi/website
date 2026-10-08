import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { receiptResponse } from "@/lib/receipt-response";
export async function GET(_request: Request, context: { params: Promise<{ reference: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["owner", "finance"].includes(admin.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { reference } = await context.params;
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference.toUpperCase())).limit(1);
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  return receiptResponse(booking);
}
