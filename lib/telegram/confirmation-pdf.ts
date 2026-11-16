import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { bookingExtras } from "@/lib/booking-extras";
import { confirmationPdfName, createConfirmationPdf } from "@/lib/confirmation-pdf";
import { loadBookingRouteStopsJson } from "@/lib/route-stops-db";
import { esc } from "@/lib/telegram/cards";
import { sendCard, sendDocument } from "@/lib/telegram/client";
import { pdfRefusal, referenceInText } from "@/lib/telegram/confirmation-pdf-rules";
import { findJobs } from "@/lib/telegram/job-lookup";
import { LOOKUP_MAX_RESULTS } from "@/lib/telegram/job-lookup-rules";

// /pdf in the Admin group: the booking's confirmation PDF (the same file as Admin → Download) as a reply.
// Read only: nothing is changed and nothing is sent to the customer.

/**
 * `query` is what followed /pdf: a booking reference or a customer name ("" = the booking in the message replied to).
 * `outsiderId` is the asker's Telegram ID when they are not an approved team member: they get nothing but their ID.
 * Replies under the asking message: the PDF, a short list when a name matches several bookings, or why not.
 */
export async function answerPdfCommand(query: string, replyTo: number, repliedText: string | null, outsiderId: string | null) {
  if (outsiderId !== null) {
    await sendCard(`เฉพาะทีม Waydidi ใน Telegram เท่านั้นที่ขอใบยืนยันได้ Telegram ID ของคุณคือ <code>${esc(outsiderId)}</code>`, undefined, replyTo);
    return;
  }
  const asked = query || referenceInText(repliedText) || "";
  if (!asked) {
    await sendCard("พิมพ์ <code>/pdf เลขจอง</code> หรือ <code>/pdf ชื่อลูกค้า</code> หรือตอบกลับการ์ดการจองด้วย <code>/pdf</code>", undefined, replyTo);
    return;
  }
  const rows = await findJobs(asked);
  if (!rows.length) { await sendCard(`ไม่พบการจองที่กำลังจะมาถึงสำหรับ “${esc(asked)}” ลองใช้นามสกุลหรือเลขจอง`, undefined, replyTo); return; }
  if (rows.length > 1) {
    const list = rows.slice(0, LOOKUP_MAX_RESULTS).map((r) => `• <code>/pdf ${esc(r.reference)}</code> ${esc(r.customer_name)} · ${esc(r.pickup_date)} ${esc(r.pickup_time)}`);
    await sendCard([`พบ ${rows.length > LOOKUP_MAX_RESULTS ? `มากกว่า ${LOOKUP_MAX_RESULTS}` : rows.length} การจอง เลือกเลขจอง:`, ...list].join("\n"), undefined, replyTo);
    return;
  }
  const refusal = pdfRefusal(rows[0].status);
  if (refusal) { await sendCard(`${esc(rows[0].reference)}: ${refusal}`, undefined, replyTo); return; }
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, rows[0].reference)).limit(1);
  // Checked again on the full row: the status may have changed since the search.
  if (!booking || pdfRefusal(booking.status)) { await sendCard(`${esc(rows[0].reference)}: ออกใบยืนยันไม่ได้ในตอนนี้`, undefined, replyTo); return; }
  try {
    const full = { ...booking, routeStopsJson: await loadBookingRouteStopsJson(booking.reference) };
    const pdf = await createConfirmationPdf(full, await bookingExtras(full));
    await sendDocument(pdf, confirmationPdfName(booking.reference, booking.pickupDate), "application/pdf", `📄 ใบยืนยันการจอง ${esc(booking.reference)}`, undefined, replyTo);
  } catch (error) {
    console.error("telegram confirmation pdf failed", error instanceof Error ? error.message : "unknown");
    await sendCard(`${esc(booking.reference)}: สร้าง PDF ไม่สำเร็จ ลองอีกครั้ง หรือดาวน์โหลดจาก Admin`, undefined, replyTo).catch(() => undefined);
  }
}
