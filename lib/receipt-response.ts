import { NextResponse } from "next/server";
import { ReceiptUnavailable, receiptPdfName } from "@/lib/receipt";
import { receiptForBooking } from "@/lib/receipt-db";
import { createReceiptPdf } from "@/lib/receipt-pdf";
import type { bookings } from "@/db/schema";
export async function receiptResponse(booking: typeof bookings.$inferSelect) {
  try {
    const receipt = await receiptForBooking(booking);
    const pdf = await createReceiptPdf(receipt);
    return new Response(new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${receiptPdfName(receipt.number)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow" } });
  } catch (error) {
    if (error instanceof ReceiptUnavailable) return NextResponse.json({ error: error.message }, { status: 409, headers: { "Cache-Control": "private, no-store" } });
    console.error("Receipt generation failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ error: "Receipt is temporarily unavailable. Please contact the team." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
