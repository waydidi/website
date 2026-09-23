import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { bookings } from "@/db/schema";
import { randomBookingReference } from "@/lib/booking-reference";

export async function uniqueBookingReference() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const reference = randomBookingReference();
    const [existing] = await getDb().select({ reference: bookings.reference }).from(bookings).where(eq(bookings.reference, reference)).limit(1);
    if (!existing) return reference;
  }
  throw new Error("BOOKING_REFERENCE_COLLISION");
}
