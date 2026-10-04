import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { Commissions } from "@/components/trip-planner/commissions";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agency commissions · Waydidi operations", robots: { index: false, follow: false } };

export default async function Page() {
  const access = await requireWaydidiAdmin("/admin/trips/commissions");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <Commissions />;
}
