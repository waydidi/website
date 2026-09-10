import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { createConfirmationPdf } from "@/lib/confirmation-pdf";
import { constantTimeEqual, sha256 } from "@/lib/security";

export async function GET(request: Request, context: { params: Promise<{ reference: string }> }) {
  const { reference } = await context.params;
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking || !token || !constantTimeEqual(await sha256(token), booking.accessTokenHash)) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status !== "confirmed") return NextResponse.json({ error: "PDF is not ready." }, { status: 409 });
  const pdf = await createConfirmationPdf(booking);
  if (booking.pdfKey && env.BUCKET) {
    await env.BUCKET.put(booking.pdfKey, pdf, { httpMetadata: { contentType: "application/pdf" } });
  }
  return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), { headers: {
    "Content-Type": "application/pdf",
    "Content-Disposition": `attachment; filename="Waydidi-${reference}.pdf"`,
    "Cache-Control": "private, no-store",
  } });
}
