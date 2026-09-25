import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { requireWaydidiAdmin } from "@/lib/admin";
import { adminGifts, GIFTS, type GiftId } from "@/lib/gifts";
import { TIERS } from "@/lib/member-tier-rules";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Member gifts · Waydidi operations", robots: { index: false, follow: false } };

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

// Every badge gift issued, with who has it and whether it's been used.
export default async function GiftsAdminPage() {
  const access = await requireWaydidiAdmin("/admin/gifts");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const gifts = await adminGifts().catch(() => null);
  const ids = [...new Set((gifts ?? []).map((g) => g.customerId))];
  const people = ids.length ? await getDb().select({ id: customers.id, email: customers.email }).from(customers).where(inArray(customers.id, ids.slice(0, 90))).catch(() => []) : [];
  const email = new Map(people.map((p) => [p.id, p.email]));
  const now = new Date().toISOString();
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-[#1f1726] sm:px-8">
    <div className="mx-auto max-w-[1200px]">
      <h1 className="text-2xl font-black">Member gifts</h1>
      <p className="mt-1 text-sm text-slate-600">Gifts are issued automatically when a member reaches Gold ({GIFTS.child_seat.name}), Diamond ({GIFTS.exchange_stop.name}) or Platinum ({GIFTS.airport_transfer.name}). Each lasts 90 days and is used automatically at checkout.</p>
      {!gifts ? <p className="mt-6 rounded-2xl bg-amber-50 p-5 text-amber-900">The member_gifts table isn&apos;t in the database yet.</p>
        : gifts.length === 0 ? <p className="mt-6 rounded-2xl bg-white p-8 text-center text-slate-500">No gifts issued yet.</p>
        : <div className="mt-5 overflow-x-auto rounded-2xl bg-white shadow-sm"><table className="w-full text-left text-sm">
          <thead className="border-b text-xs uppercase text-slate-500"><tr><th className="p-3">Member</th><th className="p-3">Gift</th><th className="p-3">Badge</th><th className="p-3">Issued</th><th className="p-3">Expires</th><th className="p-3">Status</th></tr></thead>
          <tbody>{gifts.map((g) => <tr key={g.id} className="border-b last:border-0">
            <td className="p-3">{email.get(g.customerId) ?? g.customerId}</td>
            <td className="p-3 font-semibold">{GIFTS[g.giftId as GiftId]?.name ?? g.giftId}</td>
            <td className="p-3">{TIERS.find((t) => t.id === g.tier)?.name ?? g.tier}</td>
            <td className="p-3">{date(g.issuedAt)}</td>
            <td className="p-3">{date(g.expiresAt)}</td>
            <td className="p-3">{g.usedBookingReference ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-bold text-emerald-800">Used · {g.usedBookingReference}</span> : g.expiresAt < now ? <span className="text-slate-500">Expired</span> : <span className="rounded-full bg-orange-50 px-2 py-0.5 font-bold text-[#C96100]">Available</span>}</td>
          </tr>)}</tbody>
        </table></div>}
    </div>
  </main>;
}
