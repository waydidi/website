import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { agencyApplications, bookingForms, bookings, bookingSources } from "@/db/schema";
import type { Customer } from "@/lib/customer-auth";

export type Agency = typeof agencyApplications.$inferSelect;

/** The approved travel agency whose contact email the signed-in customer verified. */
export async function agencyForCustomer(customer: Customer | null) {
  if (!customer) return null;
  const [agency] = await getDb().select().from(agencyApplications)
    .where(and(eq(agencyApplications.status, "approved"), sql`lower(${agencyApplications.email}) = ${customer.email.toLowerCase()}`))
    .limit(1);
  return agency ?? null;
}

const agencySource = (agency: Agency) => `agency:${agency.id}`;

/** Bookings recorded for this agency (manual bookings and form links tagged with it). */
export async function agencyBookings(agency: Agency) {
  const refs = getDb().select({ ref: bookingSources.bookingReference }).from(bookingSources).where(eq(bookingSources.source, agencySource(agency)));
  return getDb().select().from(bookings).where(inArray(bookings.reference, refs)).orderBy(desc(bookings.pickupDate), desc(bookings.pickupTime)).limit(300);
}

export async function agencyBooking(agency: Agency, reference: string) {
  const [source] = await getDb().select().from(bookingSources).where(and(eq(bookingSources.bookingReference, reference), eq(bookingSources.source, agencySource(agency)))).limit(1);
  if (!source) return null;
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, reference)).limit(1);
  return booking ?? null;
}

/** Ride requests the agency sent that aren't booked yet. */
export async function agencyRequests(agency: Agency) {
  return getDb().select().from(bookingForms)
    .where(and(eq(bookingForms.agencyId, agency.id), inArray(bookingForms.status, ["waiting", "submitted"])))
    .orderBy(desc(bookingForms.createdAt)).limit(50);
}
