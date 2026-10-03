import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { TripsList } from "@/components/trip-planner/trips-list";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trip planner · Waydidi operations", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const access = await requireWaydidiAdmin("/admin/trips");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const { view } = await searchParams;
  return <TripsList mode="admin" view={view === "templates" ? "templates" : "trips"} />;
}
