// /pdf in the Admin Telegram group: which booking the team member asked for, and whether its confirmation
// may be sent. Pure (no runtime imports) so it is unit tested directly (tests/telegram-confirmation-pdf.test.mjs).

import { isCommittedStatus } from "@/lib/booking-status";
import { looksLikeReference } from "@/lib/telegram/job-lookup-rules";

/** The text after /pdf ("" when nothing follows), or null when the message is not the /pdf command. */
export function parsePdfCommand(text: string): string | null {
  const match = text.trim().match(/^\/pdf(?:@\w+)?(?:\s+([\s\S]*))?$/i);
  if (!match) return null;
  const query = (match[1] ?? "").replace(/\s+/g, " ").trim();
  return query.length <= 60 ? query : null;
}

/** The booking reference in a message the /pdf replies to: a booking card ("Reference: X") or a job message (reference first). */
export function referenceInText(text: string | null | undefined): string | null {
  if (!text) return null;
  const labelled = text.match(/Reference:\s*([A-Z0-9]{5,12})\b/i)?.[1];
  if (labelled && looksLikeReference(labelled)) return labelled.toUpperCase();
  const first = text.trim().split(/\s+/)[0]?.replace(/[^A-Z0-9]/gi, "") ?? "";
  return looksLikeReference(first) ? first.toUpperCase() : null;
}

/** A confirmation is only sent for a booking that is really booked; otherwise the reason, in Thai, for the team. */
export function pdfRefusal(status: string): string | null {
  if (isCommittedStatus(status)) return null;
  if (status === "pending_payment") return "ยังไม่ได้ยืนยัน (รอชำระเงิน) จึงยังออกใบยืนยันไม่ได้";
  if (status === "cancelled" || status === "refunded") return "ถูกยกเลิกแล้ว จึงออกใบยืนยันไม่ได้";
  return `สถานะ ${status} ออกใบยืนยันไม่ได้`;
}
