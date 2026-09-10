import type { Metadata } from "next";
import DriverTripClient from "./trip-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Driver trip · Waydidi", robots: { index: false, follow: false } };

export default async function DriverTripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <DriverTripClient token={token} />;
}
