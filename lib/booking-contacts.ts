import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingContacts } from "@/db/schema";

// Extra recipients for a booking's emails (never the lead passenger's own address).
export async function contactEmails(reference: string) {
  const rows = await getDb().select({ email: bookingContacts.email }).from(bookingContacts).where(eq(bookingContacts.bookingReference, reference)).catch(() => []);
  return rows.map((row) => row.email);
}

export async function contactEmailsFor(references: string[]) {
  const map = new Map<string, string[]>();
  if (!references.length) return map;
  const rows = await getDb().select({ reference: bookingContacts.bookingReference, email: bookingContacts.email }).from(bookingContacts).where(inArray(bookingContacts.bookingReference, references)).catch(() => []);
  for (const row of rows) map.set(row.reference, [...(map.get(row.reference) ?? []), row.email]);
  return map;
}
