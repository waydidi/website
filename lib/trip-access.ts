import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingAssignments, bookingEvents, bookings } from "@/db/schema";
import { managedBooking } from "@/lib/booking-management";
import { parseShareToken, shareIssuedAfterRevoke } from "@/lib/customer-trip-rules";
import { constantTimeEqual, sha256 } from "@/lib/security";
import { tripSecretHmacHex } from "@/lib/trip-pin";

export type TripAccess = "owner" | "shared";
type Booking = typeof bookings.$inferSelect;

const REFERENCE_PATTERN = /^(?:[A-HJ-NP-Z2-9]{6}|WD-[A-F0-9]{12})$/u;

/** Signed key for the booking owner's trip link, sent in emails. */
export async function tripOwnerKey(reference: string) {
  return (await tripSecretHmacHex(`trip-owner:${reference}`)).slice(0, 32);
}

async function shareSignature(reference: string, issuedAt: number) {
  return (await tripSecretHmacHex(`trip-share:${reference}:${issuedAt}`)).slice(0, 32);
}

export async function createShareToken(reference: string, issuedAt = Date.now()) {
  return `${issuedAt.toString(36)}.${await shareSignature(reference, issuedAt)}`;
}

export async function latestShareRevoke(reference: string) {
  const [row] = await getDb().select({ createdAt: bookingEvents.createdAt }).from(bookingEvents)
    .where(and(eq(bookingEvents.bookingReference, reference), eq(bookingEvents.eventType, "trip_share_revoked")))
    .orderBy(desc(bookingEvents.createdAt)).limit(1);
  return row?.createdAt ?? null;
}

/**
 * Who is looking at a trip: the owner (confirmation link token, emailed trip
 * key, or a booking-management session) or someone holding a share link.
 * Share-link expiry depends on the trip's progress and is checked by the caller.
 */
export async function resolveTripAccess(request: Request, reference: string): Promise<{ booking: Booking; access: TripAccess } | null> {
  if (!REFERENCE_PATTERN.test(reference)) return null;
  const params = new URL(request.url).searchParams;
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  if (!booking || booking.status === "binned" || booking.status === "pending_payment") return null;

  const token = params.get("token") ?? "";
  if (token && token.length <= 200 && constantTimeEqual(await sha256(token), booking.accessTokenHash)) return { booking, access: "owner" };
  const key = params.get("key") ?? "";
  if (key && constantTimeEqual(key, await tripOwnerKey(reference))) return { booking, access: "owner" };
  const managed = await managedBooking(request);
  if (managed?.reference === reference) return { booking, access: "owner" };

  const share = parseShareToken(params.get("share") ?? "");
  if (share && constantTimeEqual(share.signature, await shareSignature(reference, share.issuedAt))) {
    if (shareIssuedAfterRevoke(share.issuedAt, await latestShareRevoke(reference))) return { booking, access: "shared" };
  }
  return null;
}

export async function activeAssignment(reference: string) {
  const [assignment] = await getDb().select().from(bookingAssignments)
    .where(and(eq(bookingAssignments.bookingReference, reference), isNull(bookingAssignments.revokedAt)))
    .orderBy(desc(bookingAssignments.assignedAt)).limit(1);
  return assignment ?? null;
}
