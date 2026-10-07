import type { Metadata } from "next";
import { AdminAffiliates } from "@/components/admin-affiliates/affiliates";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Affiliates · Waydidi operations", robots: { index: false, follow: false } };

export default async function AffiliatesPage() {
  const access = await requireWaydidiAdmin("/admin/affiliates");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <main className="px-4 py-5 sm:px-8"><AdminAffiliates /></main>;
}
