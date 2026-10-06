import type { Metadata } from "next";
import { AdminFlights } from "@/components/admin-flights/flights";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Flights · Waydidi operations", robots: { index: false, follow: false } };

export default async function FlightsAdminPage() {
  const access = await requireWaydidiAdmin("/admin/flights");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <main className="px-4 py-5 sm:px-8">
    <h1 className="mb-4 text-2xl font-black tracking-[-.02em]">Flight data</h1>
    <AdminFlights />
  </main>;
}
