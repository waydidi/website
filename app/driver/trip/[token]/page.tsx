import type { Metadata } from "next";
import DriverTripClient from "./trip-client";
import { DriverDayPlan } from "@/components/driver/day-plan";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "งานคนขับ · Waydidi", robots: { index: false, follow: false } };

export default async function DriverTripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // The driver link is in Thai.
  return <div lang="th"><DriverTripClient token={token} /><DriverDayPlan token={token} /></div>;
}
