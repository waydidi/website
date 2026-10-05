import type { Metadata } from "next";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { UsersWorkspace } from "@/components/users-admin/users-workspace";
import { requireWaydidiAdmin } from "@/lib/admin";
import { listCustomers } from "@/lib/customer-admin";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Users · Waydidi operations", robots: { index: false, follow: false } };

/** Bangkok month start and 30 days ago, worked out on the server so the list renders the same everywhere. */
function periods(now = Date.now()) {
  const bkk = new Date(now + 7 * 3600_000);
  return { monthStart: new Date(Date.UTC(bkk.getUTCFullYear(), bkk.getUTCMonth(), 1) - 7 * 3600_000).toISOString(), activeSince: new Date(now - 30 * 86400_000).toISOString() };
}

export default async function UsersAdminPage() {
  const access = await requireWaydidiAdmin("/admin/users");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const users = await listCustomers("");
  const { monthStart, activeSince } = periods();
  return <UsersWorkspace monthStart={monthStart} activeSince={activeSince}
    users={users.map((u) => ({ id: u.id, name: u.name ?? null, surname: u.surname ?? null, email: u.email, phone: u.phone ?? null, providers: u.providers ?? null, trips: Number(u.trips) || 0, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt ?? null, marketingOptIn: Boolean(u.marketingOptIn) }))} />;
}
