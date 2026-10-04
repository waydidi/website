import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { PackagesWorkspace } from "@/components/trip-planner/packages-workspace";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trip packages · Waydidi operations", robots: { index: false, follow: false } };

export default async function Page() {
  const access = await requireWaydidiAdmin("/admin/trips/packages");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <PackagesWorkspace />;
}
