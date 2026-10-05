import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { TripsList } from "@/components/trip-planner/trips-list";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trip planner · Waydidi operations", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ view?: string; quote?: string }> }) {
  const access = await requireWaydidiAdmin("/admin/trips");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const { view, quote } = await searchParams;
  // Saved trip plans (the old "Quick quote templates") now live under Packages.
  if (view === "templates") { const { redirect } = await import("next/navigation"); redirect("/admin/trips/packages"); }
  return <TripsList mode="admin" view="trips" quoteId={quote} />;
}
