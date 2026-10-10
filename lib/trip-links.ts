import { env } from "cloudflare:workers";
import { secureToken, sha256 } from "@/lib/security";
import { SITE_URL } from "@/lib/site";
import { rideUrl } from "@/lib/trip-access";

// The two links a booking has:
//  • the customer's ride-status page (/trip/REF?ride=…), valid until 7 days after the trip;
//  • the driver's job page (/driver/trip/TOKEN), which works (and is shown) once a driver is assigned.
// Assigning a driver uses the prepared driver link; a different driver later gets a fresh one,
// so a replaced driver's link stops working.

type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; run: () => Promise<{ meta: { changes: number } }> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };

/** Creates the booking's driver link(s) once; safe to call again. */
export async function ensureDriverLink(reference: string, leg = "outbound") {
  const row = await db().prepare("SELECT driver_token FROM booking_links WHERE booking_reference=? AND leg=?").bind(reference, leg).first<{ driver_token: string }>();
  if (row) return row.driver_token;
  const token = secureToken();
  await db().prepare("INSERT INTO booking_links(booking_reference,leg,driver_token,created_at) VALUES(?,?,?,?) ON CONFLICT DO NOTHING").bind(reference, leg, token, new Date().toISOString()).run();
  return (await db().prepare("SELECT driver_token FROM booking_links WHERE booking_reference=? AND leg=?").bind(reference, leg).first<{ driver_token: string }>())?.driver_token ?? token;
}

/** The token to use when assigning a driver: the prepared one, or a fresh one if it was already used. */
export async function driverTokenForAssignment(reference: string, leg = "outbound") {
  const token = await ensureDriverLink(reference, leg);
  const used = await db().prepare("SELECT 1 x FROM booking_assignments WHERE token_hash=?").bind(await sha256(token)).first();
  if (!used) return token;
  const fresh = secureToken();
  await db().prepare("UPDATE booking_links SET driver_token=?,created_at=? WHERE booking_reference=? AND leg=?").bind(fresh, new Date().toISOString(), reference, leg).run();
  return fresh;
}

export const driverUrl = (token: string) => `${SITE_URL}/driver/trip/${token}`;

/** The driver's link for a leg, only once a driver has been assigned with it (before that it can't open). */
async function assignedDriverUrl(reference: string, leg: string) {
  const row = await db().prepare("SELECT driver_token FROM booking_links WHERE booking_reference=? AND leg=?").bind(reference, leg).first<{ driver_token: string }>();
  if (!row) return null;
  const live = await db().prepare("SELECT 1 x FROM booking_assignments WHERE token_hash=? AND revoked_at IS NULL AND token_expires_at>?").bind(await sha256(row.driver_token), new Date().toISOString()).first();
  return live ? driverUrl(row.driver_token) : null;
}

/** The customer's ride-status link, and the driver links once a driver is assigned. */
export async function bookingLinks(booking: { reference: string; createdAt: string; returnDate?: string | null }) {
  return {
    // Each link on its own: a problem with one never hides the other.
    customer: await rideUrl(SITE_URL, booking).catch(() => null),
    driver: await assignedDriverUrl(booking.reference, "outbound"),
    driverReturn: booking.returnDate ? await assignedDriverUrl(booking.reference, "return") : null,
  };
}
