import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { bookingExtras } from "@/lib/booking-extras";
import { createConfirmationPdf } from "@/lib/confirmation-pdf";

/**
 * After an admin (or an approved customer change) edits a booking: the stored confirmation PDF is made again
 * from the current details and replaces the old file under the same key, so the reference never changes.
 * Downloads (Admin → Download, the customer's PDF link) always build from the current details as well.
 * Best effort: a problem here never fails the edit. Returns whether a stored PDF was replaced.
 */
export async function refreshStoredConfirmationPdf(reference: string) {
  try {
    if (!env.BUCKET) return false;
    const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
    if (!booking || booking.status !== "confirmed" || !booking.pdfKey) return false;
    await env.BUCKET.put(booking.pdfKey, await createConfirmationPdf(booking, await bookingExtras(booking)), { httpMetadata: { contentType: "application/pdf" } });
    return true;
  } catch (error) {
    console.error("confirmation pdf refresh failed", reference, error instanceof Error ? error.message : "unknown");
    return false;
  }
}
