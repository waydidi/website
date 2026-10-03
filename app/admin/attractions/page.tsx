import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { AttractionsWorkspace } from "@/components/trip-planner/attractions-workspace";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Attractions · Waydidi operations", robots: { index: false, follow: false } };

export default async function Page() {
  const access = await requireWaydidiAdmin("/admin/attractions");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <AttractionsWorkspace />;
}
