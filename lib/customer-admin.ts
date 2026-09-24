import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { customerBookingLinks, customerIdentities, customerLoginCodes, customerSavedPassengers, customerSavedPlaces, customers, customerSessions } from "@/db/schema";
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
    trips: sql<number>`(select count(*) from bookings b where b.status in (${statuses}) and (lower(b.customer_email) = "customers"."email" or b.reference in (select l.booking_reference from customer_booking_links l where l.customer_id = "customers"."id")))`,
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
