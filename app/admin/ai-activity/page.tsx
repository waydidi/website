import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { AiActivityLog } from "@/components/sales-ai/activity-log";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI activity · Waydidi operations", robots: { index: false, follow: false } };

// Owner only: allowedStaffRoute refuses /admin/ai-activity for every other role, and the API checks again.
export default async function Page() {
  const access = await requireWaydidiAdmin("/admin/ai-activity");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  return <main className="px-4 py-5 sm:px-8"><AiActivityLog /></main>;
}
