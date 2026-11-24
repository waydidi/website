import type { Metadata } from "next";
import { HomePage } from "@/components/home/home-page";

// Search results address (/reservation?ride=…). The booking flow reads the ride
// ID in the browser, loads the saved search and prices it again.
export const metadata: Metadata = { title: "Choose your vehicle · Waydidi", robots: { index: false, follow: false } };

export default function ReservationPage() {
  return <HomePage locale="en" />;
}
