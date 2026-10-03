import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { TripWorkspace } from "@/components/trip-planner/trip-workspace";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "New trip · Waydidi operations", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const access = await requireWaydidiAdmin("/admin/trips/new");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <TripWorkspace mode="admin" initialTemplate={(await searchParams).template === "1"} />;
}
