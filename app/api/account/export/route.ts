import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { customerSavedPassengers, customerSavedPlaces, customerSessions } from "@/db/schema";
import { customerBookings, customerFromRequest } from "@/lib/customer-auth";

// PDPA data-portability request: everything held against this account.
export async function GET(request: Request) {
  const session = await customerFromRequest(request);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { customer } = session;
  const [trips, sessions, savedPlaces, savedPassengers] = await Promise.all([
    customerBookings(customer),
    getDb().select({ createdAt: customerSessions.createdAt, lastUsedAt: customerSessions.lastUsedAt, userAgent: customerSessions.userAgent }).from(customerSessions).where(eq(customerSessions.customerId, customer.id)),
    getDb().select({ label: customerSavedPlaces.label, address: customerSavedPlaces.address, createdAt: customerSavedPlaces.createdAt }).from(customerSavedPlaces).where(eq(customerSavedPlaces.customerId, customer.id)),
    getDb().select({ name: customerSavedPassengers.name, surname: customerSavedPassengers.surname, email: customerSavedPassengers.email, phone: customerSavedPassengers.phone, notes: customerSavedPassengers.notes }).from(customerSavedPassengers).where(eq(customerSavedPassengers.customerId, customer.id)),
  ]);
  const body = {
    exportedAt: new Date().toISOString(),
    profile: { email: customer.email, name: customer.name, surname: customer.surname, phone: customer.phone, contactPreference: customer.contactPreference, marketingOptIn: customer.marketingOptIn, createdAt: customer.createdAt },
    bookings: trips.map((b) => ({
      reference: b.reference, status: b.status, serviceType: b.serviceType, pickup: b.pickup, dropoff: b.dropoff, pickupDate: b.pickupDate, pickupTime: b.pickupTime,
      returnPickup: b.returnPickup, returnDropoff: b.returnDropoff, returnDate: b.returnDate, returnTime: b.returnTime,
      passengers: b.passengers, luggage: b.luggage, vehicle: b.vehicle, total: b.total, paymentMethod: b.paymentMethod, paymentStatus: b.paymentStatus,
      customerName: b.customerName, customerSurname: b.customerSurname, customerEmail: b.customerEmail, customerPhone: b.customerPhone, createdAt: b.createdAt,
    })),
    savedPlaces,
    savedPassengers,
    signedInDevices: sessions,
  };
  return new Response(JSON.stringify(body, null, 2), { headers: {
    "Content-Type": "application/json",
    "Content-Disposition": 'attachment; filename="waydidi-account-data.json"',
    "Cache-Control": "private, no-store",
  } });
}
