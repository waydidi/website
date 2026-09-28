import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { StorefrontsWorkspace } from "@/components/storefronts-admin/storefronts-workspace";
import { getDb } from "@/db";
import { storefronts } from "@/db/schema";
import { requireWaydidiAdmin } from "@/lib/admin";
import { storeBalance, storefrontBookings } from "@/lib/storefront";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Storefronts · Waydidi operations", robots: { index: false, follow: false } };

// Storefront QR partners: special price, commission and cash settlement per store.
export default async function StorefrontsPage() {
  const access = await requireWaydidiAdmin("/admin/storefronts");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const stores = await getDb().select().from(storefronts).orderBy(desc(storefronts.createdAt)).catch(() => null);
  if (!stores) return <p className="m-8 rounded-2xl bg-amber-50 p-5 text-amber-900">The storefronts table isn&apos;t in the database yet.</p>;
  const all = await storefrontBookings();
  const rows = stores.map((s) => {
    const bookings = all.filter((b) => b.storefrontId === s.id);
    return { ...s, bookings, stats: storeBalance(bookings), revenue: bookings.filter((b) => b.state !== "cancelled").reduce((n, b) => n + b.total, 0) };
  });
  return <StorefrontsWorkspace stores={rows} />;
}
