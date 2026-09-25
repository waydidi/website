import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { DriversWorkspace } from "@/components/drivers-admin/drivers-workspace";
import { requireWaydidiAdmin } from "@/lib/admin";
import { driverManagement } from "@/lib/driver-management";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Drivers · Waydidi operations", robots: { index: false, follow: false } };

export default async function DriversPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const access = await requireWaydidiAdmin("/admin/drivers");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const [data, q] = await Promise.all([driverManagement(), searchParams]);
  return <DriversWorkspace data={data} initialTab={q.tab === "applications" ? "applications" : "all"} />;
}
