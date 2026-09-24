import { and, count, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { bookingAssignments, bookings, checkoutAttempts, customerBookingLinks, customers, customerSessions } from "@/db/schema";
import { cookieValue } from "@/lib/booking-management";
import { ACCOUNT_COOKIE, ACCOUNT_VISIBLE_STATUSES, SESSION_DAYS } from "@/lib/customer-account";
import { secureToken, sha256 } from "@/lib/security";

export type Customer = typeof customers.$inferSelect;
const DAY = 86_400_000;

async function customerForToken(token: string) {
  if (!token || token.length > 200) return null;
  const tokenHash = await sha256(token);
  const now = new Date();
  const [row] = await getDb()
    .select({ session: customerSessions, customer: customers })
    .from(customerSessions)
    .innerJoin(customers, eq(customers.id, customerSessions.customerId))
    .where(eq(customerSessions.tokenHash, tokenHash))
    .limit(1);
  if (!row || row.session.expiresAt <= now.toISOString()) return null;
  // Sliding expiry, written at most once a day per session.
  if (now.getTime() - new Date(row.session.lastUsedAt).getTime() > DAY) {
    await getDb().update(customerSessions)
      .set({ lastUsedAt: now.toISOString(), expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY).toISOString() })
      .where(eq(customerSessions.id, row.session.id));
    await getDb().update(customers).set({ lastSeenAt: now.toISOString() }).where(eq(customers.id, row.customer.id));
  }
  return { customer: row.customer, sessionId: row.session.id };
}

/** Signed-in customer for server components and pages. */
export async function currentCustomer() {
  const token = (await cookies()).get(ACCOUNT_COOKIE)?.value ?? "";
  return (await customerForToken(token))?.customer ?? null;
}

/** Signed-in customer (and session id) for route handlers. */
export async function customerFromRequest(request: Request) {
  return customerForToken(cookieValue(request, ACCOUNT_COOKIE));
}

export async function createCustomerSession(customerId: string, userAgent: string | null) {
  const token = secureToken();
  const now = new Date();
  await getDb().delete(customerSessions).where(lt(customerSessions.expiresAt, now.toISOString()));
  await getDb().insert(customerSessions).values({
    id: crypto.randomUUID(),
    customerId,
    tokenHash: await sha256(token),
    userAgent: userAgent?.slice(0, 200) ?? null,
    expiresAt: new Date(now.getTime() + SESSION_DAYS * DAY).toISOString(),
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
  });
  return token;
}

// A booking belongs to a customer if it was made while signed in, or if it
// was made as a guest with the email address the customer has verified.
function ownedBy(customer: Customer) {
  const linked = getDb().select({ reference: customerBookingLinks.bookingReference }).from(customerBookingLinks).where(eq(customerBookingLinks.customerId, customer.id));
  return or(inArray(bookings.reference, linked), sql`lower(${bookings.customerEmail}) = ${customer.email}`);
}

export async function customerBookings(customer: Customer) {
  return getDb().select().from(bookings)
    .where(and(ownedBy(customer), inArray(bookings.status, [...ACCOUNT_VISIBLE_STATUSES])))
    .orderBy(desc(bookings.pickupDate), desc(bookings.pickupTime))
    .limit(200);
}

export async function customerBooking(customer: Customer, reference: string) {
  const [booking] = await getDb().select().from(bookings)
    .where(and(eq(bookings.reference, reference), ownedBy(customer), inArray(bookings.status, [...ACCOUNT_VISIBLE_STATUSES])))
    .limit(1);
  return booking ?? null;
}

/**
 * Per-IP limiter shared with the other public endpoints (checkout_attempts
 * table, salted fingerprint). Records the attempt and returns true when the
 * caller is over the limit.
 */
export async function overRateLimit(request: Request, scope: string, limit: number, windowMinutes: number, salt: string) {
  const address = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "unknown";
  const fingerprintHash = await sha256(`${scope}:${salt}:${address}`);
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const [{ attempts }] = await getDb().select({ attempts: count() }).from(checkoutAttempts)
    .where(and(eq(checkoutAttempts.fingerprintHash, fingerprintHash), gt(checkoutAttempts.createdAt, since)));
  if (attempts >= limit) return true;
  await getDb().insert(checkoutAttempts).values({ fingerprintHash, createdAt: new Date().toISOString() });
  return false;
}

/** For account pages: the signed-in customer, or a redirect to sign in. */
export async function requireCustomer(returnTo: string) {
  const customer = await currentCustomer();
  if (!customer) redirect(`/account/sign-in?next=${encodeURIComponent(returnTo)}`);
  return customer;
}

/** Current driver-assignment status per booking reference (active assignments only). */
export async function driverStatuses(references: string[]) {
  if (!references.length) return new Map<string, string>();
  const rows = await getDb().select({ reference: bookingAssignments.bookingReference, status: bookingAssignments.currentStatus })
    .from(bookingAssignments).where(and(inArray(bookingAssignments.bookingReference, references.slice(0, 90)), isNull(bookingAssignments.revokedAt)));
  return new Map(rows.map((row) => [row.reference, row.status]));
}
