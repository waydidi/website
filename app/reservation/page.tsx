import type { Metadata } from "next";
import { HomeContent } from "@/components/home/home-content";

// Search results address (/reservation?ride=…). The booking flow reads the ride
// ID in the browser, loads the saved search and prices it again.
// Uses HomeContent, not HomePage: the homepage-only "under development" notice stays off this page.
export const metadata: Metadata = { title: "Choose your vehicle · Waydidi", robots: { index: false, follow: false } };

export default function ReservationPage() {
  return <HomeContent locale="en" />;
}
