import type { Metadata } from "next";
import { requireWaydidiAdmin } from "@/lib/admin";
import { AdminKeyLogin } from "@/components/admin-key-login";
import PricingWorkspace from "./pricing-workspace";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Pricing areas · Waydidi operations",
  robots: { index: false, follow: false },
};

export default async function PricingPage() {
  const access = await requireWaydidiAdmin("/admin/pricing");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <PricingWorkspace email={access.user.email} />;
}
