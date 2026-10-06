import type { SecurityDatabase } from "@/lib/worker-db";
import { env } from "cloudflare:workers";
import { cookieValue } from "@/lib/booking-management";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingAssignments, bookingEvents, bookings } from "@/db/schema";
import { managedBooking } from "@/lib/booking-management";
import { parseShareToken, shareIssuedAfterRevoke } from "@/lib/customer-trip-rules";
import { constantTimeEqual, sha256 } from "@/lib/security";
import { tripSecretHmacHex } from "@/lib/trip-secret";

export type TripAccess = "owner" | "shared";
type Booking = typeof bookings.$inferSelect;

const REFERENCE_PATTERN = /^(?:[A-HJ-NP-Z2-9]{6}|WD-[A-F0-9]{12})$/u;

/** Signed key for the booking owner's trip link, sent in emails. */
export async function tripOwnerKey(reference: string) {
  const issuedAt=Date.now()+1;
  return `${issuedAt.toString(36)}.${(await tripSecretHmacHex(`trip-owner:${reference}:${issuedAt}`)).slice(0,32)}`;
}

/**
 * The customer's ride-status key, made when the booking is confirmed. It's the same for the whole
 * booking (so the link in the email, the account page and the chat is one link) and works until
 * 7 days after the trip.
 */
export async function rideKey(reference: string, createdAt: string) {
  const revokedAt = await latestAccessRevoke(reference, "owner");
  // Existing unrecalled email links retain their key. Revoking an exposed key
  // rotates future links rather than permanently disabling ride status.
  return (await tripSecretHmacHex(`trip-ride:${reference}:${createdAt}${revokedAt ? `:revoked:${revokedAt}` : ""}`)).slice(0, 32);
}
export async function rideUrl(origin: string, booking: { reference: string; createdAt: string }) {
  return `${origin}/trip/${encodeURIComponent(booking.reference)}?ride=${await rideKey(booking.reference, booking.createdAt)}`;
}
const rideLinkLive = (b: Booking) => {
  const last = b.returnDate && b.returnDate > b.pickupDate ? b.returnDate : b.pickupDate;
  return Date.now() < Date.parse(`${last}T23:59:59+07:00`) + 7 * 24 * 3600000;
};

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
  if (!booking || ["binned","pending_payment","expired"].includes(booking.status)) return null;

  const cookie=cookieValue(request,`waydidi_trip_${reference}`);
  if(cookie) {
    const session=await (env.DB as SecurityDatabase).prepare("SELECT access,issued_at FROM trip_access_sessions WHERE token_hash=? AND booking_reference=? AND expires_at>?").bind(await sha256(cookie),reference,new Date().toISOString()).first<{access:TripAccess;issued_at:number}>();
    if(session&&shareIssuedAfterRevoke(session.issued_at,await latestAccessRevoke(reference,session.access))) return {booking,access:session.access};
  }
  const token = params.get("token") ?? "";
  if (token && token.length <= 200 && Date.now()-Date.parse(booking.createdAt)<24*3600000 && shareIssuedAfterRevoke(Date.parse(booking.createdAt),await latestAccessRevoke(reference,"owner")) && constantTimeEqual(await sha256(token), booking.accessTokenHash)) return { booking, access: "owner" };
  const key = params.get("key") ?? "";
  const ownerKey=parseShareToken(key);
  if(ownerKey&&ownerKey.issuedAt<=Date.now()+1000&&Date.now()-ownerKey.issuedAt<24*3600000&&shareIssuedAfterRevoke(ownerKey.issuedAt,await latestAccessRevoke(reference,"owner"))&&constantTimeEqual(ownerKey.signature,(await tripSecretHmacHex(`trip-owner:${reference}:${ownerKey.issuedAt}`)).slice(0,32))) return {booking,access:"owner"};
  const ride = params.get("ride") ?? "";
  if (/^[a-f0-9]{32}$/.test(ride) && rideLinkLive(booking)
    && constantTimeEqual(ride, await rideKey(reference, booking.createdAt))) return { booking, access: "owner" };
  const managed = await managedBooking(request);
  if (managed?.reference === reference) return { booking, access: "owner" };

  const share = parseShareToken(params.get("share") ?? "");
  if (share && share.issuedAt<=Date.now()+1000 && Date.now()-share.issuedAt<7*24*3600000 && constantTimeEqual(share.signature, await shareSignature(reference, share.issuedAt))) {
    if (shareIssuedAfterRevoke(share.issuedAt, await latestShareRevoke(reference))) return { booking, access: "shared" };
  }
  return null;
}

export async function activeAssignment(reference: string, leg = "outbound") {
  const [assignment] = await getDb().select().from(bookingAssignments)
    .where(and(eq(bookingAssignments.bookingReference, reference), eq(bookingAssignments.leg,leg), isNull(bookingAssignments.revokedAt)))
    .orderBy(desc(bookingAssignments.assignedAt)).limit(1);
  return assignment ?? null;
}

export async function latestAccessRevoke(reference:string,access:TripAccess) {
 if(access==="shared") return latestShareRevoke(reference);
 const [row]=await getDb().select({createdAt:bookingEvents.createdAt}).from(bookingEvents).where(and(eq(bookingEvents.bookingReference,reference),eq(bookingEvents.eventType,"trip_owner_revoked"))).orderBy(desc(bookingEvents.createdAt)).limit(1);
 return row?.createdAt??null;
}
