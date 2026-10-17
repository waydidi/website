// Rules for Admin → Edit booking: customer details and extras, and changing how a booking is
// paid. Pure (no database), so every rule is unit tested (tests/booking-edit.test.mjs).
import { isOfflinePayment, unpaidStatusFor } from "./payment-methods";

export type PaymentChoice = "paid" | "cash" | "waiting";

/** What the sheet edits. Built from a booking row on the server. */
export type EditableBooking = {
  reference: string; serviceType?: string | null; pickup: string; dropoff: string; pickupDate: string; pickupTime: string;
  returnDate: string | null; returnTime: string | null; vehicle: string; passengers: number; luggage: number;
  customerName: string; customerSurname: string; customerPhone: string; customerEmail: string; flightNumber: string;
  childSeats: number; specialRequests: string;
  /** Which journey's card opened the sheet: the second trip of a round trip edits its own From / To. */
  leg: "outbound" | "return";
  /** The second trip's route as shown (it follows the first trip's reversed until set). */
  returnPickup: string; returnDropoff: string;
  /** null for card payments, which can't be changed here. */
  payment: PaymentChoice | null;
};

type Row = {
  reference: string; serviceType: string | null; pickup: string; dropoff: string; pickupDate: string; pickupTime: string;
  returnDate: string | null; returnTime: string | null; vehicle: string; passengers: number; luggage: number;
  customerName: string; customerSurname: string | null; customerPhone: string | null; customerEmail: string; flightNumber: string | null;
  childSeats: number; specialRequests: string | null; paymentMethod: string; paymentStatus: string;
  returnPickup?: string | null; returnDropoff?: string | null;
};

/** How a booking is paid, in the three Create booking choices; null when paid by card online. */
export function paymentChoiceOf(method: string, status: string): PaymentChoice | null {
  if (method === "manual") return "paid";
  if (!isOfflinePayment(method)) return null;
  if (status === "paid") return "paid";
  return method === "transfer" ? "waiting" : "cash";
}

export function editableFrom(b: Row, leg: "outbound" | "return" = "outbound"): EditableBooking {
  return {
    reference: b.reference, serviceType: b.serviceType, pickup: b.pickup, dropoff: b.dropoff, pickupDate: b.pickupDate, pickupTime: b.pickupTime,
    returnDate: b.returnDate, returnTime: b.returnTime, vehicle: b.vehicle, passengers: b.passengers, luggage: b.luggage,
    customerName: b.customerName, customerSurname: b.customerSurname ?? "", customerPhone: b.customerPhone ?? "", customerEmail: b.customerEmail,
    flightNumber: b.flightNumber ?? "", childSeats: b.childSeats, specialRequests: b.specialRequests ?? "",
    leg, returnPickup: b.returnPickup || b.dropoff, returnDropoff: b.returnDropoff || b.pickup,
    payment: paymentChoiceOf(b.paymentMethod, b.paymentStatus),
  };
}

/** The second trip's stored route: empty (null) while it is just the first trip reversed, so it keeps following the first trip. */
export function storedReturnRoute(pickup: string, dropoff: string, firstPickup: string, firstDropoff: string) {
  return { returnPickup: pickup === firstDropoff ? null : pickup, returnDropoff: dropoff === firstPickup ? null : dropoff };
}

export type Details = { customerName: string; customerSurname: string | null; customerPhone: string; customerEmail: string; flightNumber: string | null; childSeats: number; specialRequests: string | null };

/** Customer details and extras from the request; fields left out keep their current value. Price never changes. */
export function parseDetails(input: Record<string, unknown>, current: Row): Details | { error: string } {
  const text = (key: string, fallback: string | null) => (input[key] === undefined ? fallback ?? "" : String(input[key] ?? "").trim().replace(/\s+/g, " "));
  const customerName = text("customerName", current.customerName);
  const customerSurname = text("customerSurname", current.customerSurname);
  const customerPhone = text("customerPhone", current.customerPhone);
  const customerEmail = text("customerEmail", current.customerEmail).toLowerCase();
  const flightNumber = text("flightNumber", current.flightNumber).toUpperCase().replace(/\s+/g, "");
  const specialRequests = input.specialRequests === undefined ? current.specialRequests ?? "" : String(input.specialRequests ?? "").trim();
  const childSeats = input.childSeats === undefined ? current.childSeats : Number(input.childSeats);
  if (customerName.length < 1 || customerName.length > 100 || customerSurname.length > 100) return { error: "Enter the customer's name." };
  if (customerPhone.length < 5 || customerPhone.length > 40) return { error: "Enter a phone number." };
  if (customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return { error: "Enter a valid email address." };
  if (flightNumber.length > 20) return { error: "The flight number is too long." };
  if (!Number.isInteger(childSeats) || childSeats < 0 || childSeats > 4) return { error: "Child seats must be 0 to 4." };
  if (specialRequests.length > 500) return { error: "Notes can be up to 500 characters." };
  return { customerName, customerSurname: customerSurname || null, customerPhone, customerEmail, flightNumber: flightNumber || null, childSeats, specialRequests: specialRequests || null };
}

export function detailsChanged(d: Details, b: Row) {
  return d.customerName !== b.customerName || d.customerSurname !== (b.customerSurname || null) || d.customerPhone !== (b.customerPhone ?? "") || d.customerEmail !== b.customerEmail
    || d.flightNumber !== (b.flightNumber || null) || d.childSeats !== b.childSeats || d.specialRequests !== (b.specialRequests || null);
}

/** Who may mark a booking as paid: the roles that record money in Admin → Payments. */
export const mayRecordPayment = (role: string) => role === "owner" || role === "finance";

export type PaymentPlan =
  | { kind: "none" }
  | { kind: "error"; error: string }
  /** Change the method only (no money recorded): cash ↔ waiting, or correcting a booking marked paid by mistake. */
  | { kind: "switch"; paymentMethod: "cash" | "transfer"; paymentStatus: string }
  /** Record the remaining balance as received, in the cash-receipt ledger. */
  | { kind: "record"; amountMinor: number };

/**
 * What changing the payment choice does. Money already recorded is never removed: once a cash or
 * transfer booking is paid in full, refunds go through Admin → Payments instead.
 */
export function planPaymentChange(b: { paymentMethod: string; paymentStatus: string; totalMinor: number; receivedMinor: number }, target: PaymentChoice, role: string): PaymentPlan {
  const current = paymentChoiceOf(b.paymentMethod, b.paymentStatus);
  if (current === null) return { kind: "error", error: "Card payments can't be changed here." };
  if (target === current) return { kind: "none" };
  const outstanding = b.totalMinor - b.receivedMinor;
  if (target === "paid") {
    if (!mayRecordPayment(role)) return { kind: "error", error: "Only the owner or finance can mark a booking as paid." };
    if (outstanding <= 0) return { kind: "none" };
    return { kind: "record", amountMinor: outstanding };
  }
  const paymentMethod = target === "waiting" ? "transfer" : "cash";
  if (b.paymentMethod === "manual") {
    // Marked paid at creation with no money recorded: only finance may undo that.
    if (!mayRecordPayment(role)) return { kind: "error", error: "Only the owner or finance can change a paid booking." };
    if (b.receivedMinor > 0) return { kind: "error", error: "Money is recorded on this booking; use Admin → Payments." };
    return { kind: "switch", paymentMethod, paymentStatus: unpaidStatusFor(paymentMethod) };
  }
  if (outstanding <= 0) return { kind: "error", error: "This booking is paid in full. Refunds go through Admin → Payments." };
  return { kind: "switch", paymentMethod, paymentStatus: unpaidStatusFor(paymentMethod) };
}
