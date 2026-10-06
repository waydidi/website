import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingEvents, bookings, customerBookingLinks, customerIdentities, customerLoginCodes, customerSavedPassengers, customerSavedPlaces, customers, customerSessions } from "@/db/schema";
import { ACCOUNT_VISIBLE_STATUSES } from "@/lib/customer-account";

/**
 * Registered members for the admin Users tab, newest first. Trips count
 * bookings made with the member's email or while signed in.
 */
export async function listCustomers(search: string) {
  const term = search.trim().toLowerCase().slice(0, 100);
  const statuses = sql.join(ACCOUNT_VISIBLE_STATUSES.map((s) => sql`${s}`), sql`, `);
  return getDb().select({
    id: customers.id,
    email: customers.email,
    name: customers.name,
    surname: customers.surname,
    phone: customers.phone,
    marketingOptIn: customers.marketingOptIn,
    createdAt: customers.createdAt,
    lastSeenAt: customers.lastSeenAt,
    // Outer columns are written as "customers"."…" explicitly: an interpolated
    // column renders unqualified, and inside a subquery SQLite would resolve
    // a bare "id" to the inner table's own id.
    trips: sql<number>`(select count(*) from bookings b where b.status in (${statuses}) and ((lower(b.customer_email) = "customers"."email" and not exists (select 1 from customer_booking_links l where l.booking_reference=b.reference)) or b.reference in (select l.booking_reference from customer_booking_links l where l.customer_id = "customers"."id")))`,
    providers: sql<string | null>`(select group_concat(i.provider) from customer_identities i where i.customer_id = "customers"."id")`,
  }).from(customers)
    .where(term ? sql`(${customers.email} like ${`%${term}%`} or lower(coalesce(${customers.name}, '') || ' ' || coalesce(${customers.surname}, '')) like ${`%${term}%`} or coalesce(${customers.phone}, '') like ${`%${term}%`})` : undefined)
    .orderBy(desc(customers.createdAt))
    .limit(500);
}

/**
 * Deletes a member account: profile, sign-in methods, sessions, saved places
 * and travellers. Booking records are kept (unlinked) because they are
 * needed for accounting, disputes and legal duties, as the privacy notice
 * explains. Admin-only; customers cannot delete their own account.
 */
export async function deleteCustomerAccount(customerId: string) {
  const db = getDb();
  const [customer] = await db.select({ email: customers.email }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return false;
  await db.batch([
    db.delete(customerBookingLinks).where(eq(customerBookingLinks.customerId, customerId)),
    db.delete(customerIdentities).where(eq(customerIdentities.customerId, customerId)),
    db.delete(customerSavedPlaces).where(eq(customerSavedPlaces.customerId, customerId)),
    db.delete(customerSavedPassengers).where(eq(customerSavedPassengers.customerId, customerId)),
    db.delete(customerSessions).where(eq(customerSessions.customerId, customerId)),
    db.delete(customerLoginCodes).where(eq(customerLoginCodes.email, customer.email)),
    db.delete(customers).where(eq(customers.id, customerId)),
  ]);
  return true;
}

/** Adds a booking to a member's account; moving it from another account needs move=true. */
export async function linkBookingToCustomer(customerId: string, reference: string, move: boolean, by: string) {
  const db = getDb();
  const [customer] = await db.select({ id: customers.id, email: customers.email }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return { ok: false as const, status: 404, error: "User not found." };
  const [booking] = reference ? await db.select({ reference: bookings.reference, status: bookings.status, email: bookings.customerEmail, name: bookings.customerName, surname: bookings.customerSurname }).from(bookings).where(eq(bookings.reference, reference)).limit(1) : [];
  if (!booking || booking.status === "binned") return { ok: false as const, status: 404, error: "No booking with that reference." };
  const [link] = await db.select().from(customerBookingLinks).where(eq(customerBookingLinks.bookingReference, reference)).limit(1);
  if (link?.customerId === customerId || (!link && (booking.email ?? "").toLowerCase() === customer.email)) return { ok: true as const, reference, already: true };
  const [emailOwner] = !link && booking.email ? await db.select({ id: customers.id, email: customers.email }).from(customers).where(eq(customers.email, booking.email.toLowerCase())).limit(1) : [];
  if (!move && (link || (emailOwner && emailOwner.id !== customerId))) {
    const [other] = link ? await db.select({ email: customers.email }).from(customers).where(eq(customers.id, link.customerId)).limit(1) : [emailOwner];
    return { ok: false as const, status: 409, error: `This booking is in another account (${other?.email ?? "unknown"}). Move it here?`, needsMove: true };
  }
  const now = new Date().toISOString();
  const [changed] = await db.batch([
    db.insert(customerBookingLinks).values({ bookingReference: reference, customerId, createdAt: now })
      .onConflictDoUpdate({ target: customerBookingLinks.bookingReference, set: { customerId, createdAt: now }, setWhere: move ? undefined : eq(customerBookingLinks.customerId, customerId) }),
    db.insert(bookingEvents).select(sql`SELECT NULL, ${reference}, 'admin_added_to_account', NULL, ${now} FROM customer_booking_links WHERE booking_reference=${reference} AND customer_id=${customerId}`),
  ]);
  if (!changed.meta.changes) return { ok: false as const, status: 409, error: "Booking ownership changed. Review it before moving it.", needsMove: true };
  console.info("Admin added booking to account", { reference, customerId, admin: by });
  return { ok: true as const, reference, already: false, guest: `${booking.name} ${booking.surname ?? ""}`.trim() };
}
