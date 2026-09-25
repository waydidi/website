import type { Metadata } from "next";
import { inArray } from "drizzle-orm";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { getDb } from "@/db";
import { customers } from "@/db/schema";
import { requireWaydidiAdmin } from "@/lib/admin";
import { adminGifts } from "@/lib/gifts";
import { adminBoxes, listPrizes, partnerCodeCounts } from "@/lib/boxes";
import { RewardsAdmin } from "@/components/rewards-admin";

function StatCard({ label, value, sub, warn }: { label: string; value: number; sub: string; warn?: boolean }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-5">
    <p className="text-[15px] text-slate-700">{label}</p>
    <p className="mt-4 text-[36px] font-semibold leading-none tracking-[-.02em] tabular-nums">{value}</p>
    <p className={`mt-4 text-[14px] ${warn ? "font-medium text-orange-600" : "text-slate-500"}`}>{sub}</p>
  </div>;
}

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Mystery gifts · Waydidi operations", robots: { index: false, follow: false } };


// Mystery box prizes, their odds and stock, and partner tickets to arrange.
export default async function MysteryGiftsPage() {
  const access = await requireWaydidiAdmin("/admin/gifts/mystery");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const gifts = await adminGifts().catch(() => null);
  const [prizes, boxes, counts] = await Promise.all([listPrizes().catch(() => []), adminBoxes().catch(() => []), partnerCodeCounts().catch(() => new Map())]);
  const prizeKind = new Map(prizes.map((p) => [p.id, p.kind]));
  const ticketBoxes = boxes.filter((b) => b.openedAt && (prizeKind.get(b.prizeId ?? "") === "partner_ticket" || b.fulfilment));
  const ids = [...new Set([...(gifts ?? []).map((g) => g.customerId), ...ticketBoxes.map((b) => b.customerId)])];
  const people = ids.length ? await getDb().select({ id: customers.id, email: customers.email }).from(customers).where(inArray(customers.id, ids.slice(0, 90))).catch(() => []) : [];
  const email = new Map(people.map((p) => [p.id, p.email]));
  const opened = boxes.filter((b) => b.openedAt).length;
  const toArrange = ticketBoxes.filter((b) => b.fulfilment === "to_arrange").length;
  return <div className="px-4 pb-10 pt-4 sm:px-8">
    <p className="max-w-3xl text-[14px] text-slate-600">Gold, Diamond and Platinum members get a mystery box. Each box draws one prize using the odds below.</p>
    <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatCard label="Boxes given" value={boxes.length} sub="All time" />
      <StatCard label="Boxes opened" value={opened} sub={`${boxes.length - opened} still closed`} />
      <StatCard label="Prizes" value={prizes.length} sub="In the prize list" />
      <StatCard label="Tickets to arrange" value={toArrange} sub="Partner tickets to book" warn={toArrange > 0} />
    </div>
    <div className="mt-7"><RewardsAdmin prizes={prizes} codeCounts={Object.fromEntries(counts)} tickets={ticketBoxes.map((b) => ({ id: b.id, member: email.get(b.customerId) ?? b.customerId, tier: b.tier, prizeName: b.prizeName, openedAt: b.openedAt, voucherCode: b.voucherCode, fulfilment: b.fulfilment, expiresAt: b.expiresAt }))} /></div>
  </div>;
}
