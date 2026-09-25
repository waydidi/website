import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { requireWaydidiAdmin } from "@/lib/admin";
import { adminGifts, GIFTS, giftInfo } from "@/lib/gifts";
import { adminBoxes, listPrizes } from "@/lib/boxes";
import { TIERS } from "@/lib/member-tier-rules";
import { GiftsTable, type GiftRow } from "@/components/gifts-admin/gifts-table";

function StatCard({ label, value, sub, warn }: { label: string; value: number; sub: string; warn?: boolean }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5">
    <p className="text-[15px] text-slate-700">{label}</p>
    <p className="mt-4 text-[36px] font-semibold leading-none tracking-[-.02em] tabular-nums">{value}</p>
    <p className={`mt-4 text-[14px] ${warn ? "font-medium text-orange-600" : "text-slate-500"}`}>{sub}</p>
  </div>;
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tier gifts · Waydidi operations", robots: { index: false, follow: false } };


// Every badge gift issued, with who has it and whether it's been used.
export default async function GiftsAdminPage() {
  const access = await requireWaydidiAdmin("/admin/gifts");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const gifts = await adminGifts().catch(() => null);
  const [prizes, boxes] = await Promise.all([listPrizes().catch(() => []), adminBoxes().catch(() => [])]);
  const prizeKind = new Map(prizes.map((p) => [p.id, p.kind]));
  const ticketBoxes = boxes.filter((b) => b.openedAt && (prizeKind.get(b.prizeId ?? "") === "partner_ticket" || b.fulfilment));
  const ids = [...new Set([...(gifts ?? []).map((g) => g.customerId), ...ticketBoxes.map((b) => b.customerId)])];
  const people = ids.length ? await getDb().select({ id: customers.id, email: customers.email }).from(customers).where(inArray(customers.id, ids.slice(0, 90))).catch(() => []) : [];
  const email = new Map(people.map((p) => [p.id, p.email]));
  const now = new Date().toISOString();
  const badge = (tier: string) => (tier.startsWith("box-") ? `${TIERS.find((t) => `box-${t.id}` === tier)?.name ?? ""} box` : TIERS.find((t) => t.id === tier)?.name ?? tier);
  const rows: GiftRow[] = (gifts ?? []).map((g) => ({ id: g.id, member: email.get(g.customerId) ?? g.customerId, gift: giftInfo(g.giftId).name, badge: badge(g.tier), issuedAt: g.issuedAt, expiresAt: g.expiresAt, usedRef: g.usedBookingReference, state: g.usedBookingReference ? "used" : g.expiresAt < now ? "expired" : "available" }));
  return <div className="px-4 pb-10 pt-4 sm:px-8">
    <p className="max-w-3xl text-[14px] text-slate-600">Gifts are issued automatically when a member reaches Gold ({GIFTS.child_seat.name}), Diamond ({GIFTS.exchange_stop.name}) or Platinum ({GIFTS.airport_transfer.name}). Each lasts 90 days and is used automatically at checkout.</p>
    <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatCard label="Gifts issued" value={rows.length} sub="All time" />
      <StatCard label="Available now" value={rows.filter((r) => r.state === "available").length} sub="Waiting to be used" />
      <StatCard label="Used" value={rows.filter((r) => r.state === "used").length} sub="Applied at checkout" />
      <StatCard label="Expired" value={rows.filter((r) => r.state === "expired").length} sub="Not used within 90 days" />
    </div>
    {!gifts ? <p className="mt-6 rounded-2xl bg-amber-50 p-5 text-amber-900">The member_gifts table isn&apos;t in the database yet.</p> : <GiftsTable rows={rows} />}
  </div>;
}
