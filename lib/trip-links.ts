import { env } from "cloudflare:workers";
import { secureToken, sha256 } from "@/lib/security";
import { SITE_URL } from "@/lib/site";
import { rideUrl } from "@/lib/trip-access";

// The two links every booking gets as soon as it's confirmed:
//  • the customer's ride-status page (/trip/REF?ride=…), valid until 7 days after the trip;
//  • the driver's job page (/driver/trip/TOKEN), which starts working once a driver is assigned.
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

/** Both links for a booking (made if missing). */
export async function bookingLinks(booking: { reference: string; createdAt: string; returnDate?: string | null }) {
  const driver = await ensureDriverLink(booking.reference, "outbound");
  const ret = booking.returnDate ? await ensureDriverLink(booking.reference, "return") : null;
  return { customer: await rideUrl(SITE_URL, booking), driver: driverUrl(driver), driverReturn: ret ? driverUrl(ret) : null };
}
