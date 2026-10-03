import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { SuppliersWorkspace } from "@/components/trip-planner/suppliers-workspace";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Supplier contacts · Waydidi operations", robots: { index: false, follow: false } };

export default async function Page() {
  const access = await requireWaydidiAdmin("/admin/suppliers");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <SuppliersWorkspace />;
}
