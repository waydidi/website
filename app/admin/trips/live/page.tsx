import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { LiveToday } from "@/components/trip-planner/live-today";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Live today · Waydidi operations", robots: { index: false, follow: false } };

export default async function Page() {
  const access = await requireWaydidiAdmin("/admin/trips/live");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <LiveToday />;
}
