import type { Metadata } from "next";
import { count, desc } from "drizzle-orm";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { AgenciesWorkspace } from "@/components/agencies-admin/agencies-workspace";
import { getDb } from "@/db";
import { agencyApplications, newsletterSubscribers } from "@/db/schema";
import { requireWaydidiAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Travel agencies · Waydidi operations", robots: { index: false, follow: false } };

// Partner applications sent from /agencies, newest first.
export default async function AgencyApplicationsPage() {
  const access = await requireWaydidiAdmin("/admin/agencies");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const [rows, subs] = await Promise.all([
    getDb().select().from(agencyApplications).orderBy(desc(agencyApplications.createdAt)).limit(500).catch(() => null),
    getDb().select({ n: count() }).from(newsletterSubscribers).catch(() => [{ n: 0 }]),
  ]);
  if (!rows) return <p className="m-8 rounded-2xl bg-amber-50 p-5 text-amber-900">The agency_applications table isn&apos;t in the database yet.</p>;
  return <AgenciesWorkspace rows={rows} subscribers={subs[0]?.n ?? 0} />;
}
