import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { TripWorkspace } from "@/components/trip-planner/trip-workspace";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trip · Waydidi operations", robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await requireWaydidiAdmin(`/admin/trips/${id}`);
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <TripWorkspace key={id} mode="admin" tripId={id} />;
}
