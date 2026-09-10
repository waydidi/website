import type { Metadata } from "next";
import BookingLookup from "./booking-lookup";

export const metadata: Metadata = { title: "Check your booking · Waydidi", robots: { index: false, follow: false } };

export default function CheckBookingPage() {
  return <BookingLookup/>;
}
