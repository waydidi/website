import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";
import OperationsWorkspace from "./operations-workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Booking operations · Waydidi", robots: { index: false, follow: false } };

export default async function OperationsPage() {
  const access = await requireWaydidiAdmin("/admin/operations");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured}/>;
  return <OperationsWorkspace email={access.user.email}/>;
}
