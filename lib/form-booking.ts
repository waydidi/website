import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingForms } from "@/db/schema";
import type { FormAnswers, FormService } from "@/lib/booking-form";
import { createManualBooking, manualBookingProblem, manualBookingSchema } from "@/lib/manual-booking";

/** Turn a received customer form into a confirmed booking at the given price
 *  (pay in cash; the confirmation email and PDF go to the customer straight away). */
export async function bookFromForm(token: string, price: number, origin: string) {
  const [form] = await getDb().select().from(bookingForms).where(eq(bookingForms.token, token)).limit(1);
  if (!form) return { error: "That form no longer exists." } as const;
  if (form.status === "booked") return { error: `Already booked as ${form.bookingReference}.` } as const;
  if (form.status !== "submitted" || !form.answers) return { error: "The customer hasn't filled in that form yet." } as const;
  const a = JSON.parse(form.answers) as FormAnswers;
  const service = form.serviceType as FormService;
  const words = a.name.trim().split(/\s+/);
  const parsed = manualBookingSchema.safeParse({
    serviceType: service,
    pickup: a.pickup, dropoff: a.dropoff ?? "", bookedHours: service === "hourly" ? a.hours : undefined,
    pickupDate: a.date, pickupTime: a.time,
    returnDate: a.returnTrip ? a.returnDate ?? "" : "", returnTime: a.returnTrip ? a.returnTime ?? "" : "",
    flightNumber: a.flightNumber ?? "",
    customerName: words.length > 1 ? words.slice(0, -1).join(" ") : a.name, customerSurname: words.length > 1 ? words[words.length - 1] : "",
    customerEmail: a.email, customerPhone: a.phone,
    passengers: a.passengers, luggage: a.luggage, vehicle: a.vehicle,
    fare: price, childSeats: a.childSeats, exchangeStop: a.exchangeStop, ferryPeople: a.ferryPeople,
    paid: false, specialRequests: form.note ?? "", sendEmail: true, agencyId: form.agencyId ?? "", partnerFormToken:form.token,
  });
  if (!parsed.success) return { error: `The form answers can't be booked (${parsed.error.issues[0]?.path?.[0] ?? "details"}). Open it in admin instead.` } as const;
  const problem = manualBookingProblem(parsed.data);
  if (problem) return { error: problem } as const;
  // Claim the form first so two quick replies can't book it twice.
  const claimed = await getDb().update(bookingForms).set({ status: "booked" }).where(and(eq(bookingForms.token, token), eq(bookingForms.status, "submitted"))).returning();
  if (!claimed.length) return { error: "That form was just booked." } as const;
  try {
    const result = await createManualBooking(parsed.data, origin);
    await getDb().update(bookingForms).set({ bookingReference: result.reference }).where(eq(bookingForms.token, token));
    return { ...result, name: a.name } as const;
  } catch (error) {
    await getDb().update(bookingForms).set({ status: "submitted" }).where(and(eq(bookingForms.token, token),sql`${bookingForms.bookingReference} IS NULL`));
    throw error;
  }
}
