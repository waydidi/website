import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TIERS, affiliateForDashboard, partnerDashboard } from "@/lib/affiliates";
import { CopyRow, LinkBuilder, PartnerQr } from "@/components/partner/tools";
import { WaydidiLogo } from "@/components/waydidi-logo";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Partner dashboard · Waydidi", robots: { index: false, follow: false } };

const thb = (n: number) => `฿${n.toLocaleString("en-US")}`;
// Only the first part of an address (e.g. "Suvarnabhumi Airport", "Patong"): no customer details.
const short = (place: string) => place.split(",")[0].replace(/\s*\([A-Z]{3}\)$/, "").slice(0, 40);
const STATE: Record<string, [string, string]> = {
  pending: ["Pending", "bg-amber-50 text-amber-800"], owed: ["Earned", "bg-[#FFF0DF] text-[#C96100]"],
  paid: ["Paid", "bg-emerald-50 text-emerald-700"], cancelled: ["Cancelled", "bg-slate-100 text-slate-500 line-through"],
};

// A partner's own dashboard, opened from the private link Waydidi sends them.
export default async function PartnerDashboard({ params }: { params: Promise<{ id: string; key: string }> }) {
  const { id, key } = await params;
  const a = await affiliateForDashboard(id, key);
  if (!a) notFound();
  const d = await partnerDashboard(a);
  const TIER_ROWS = TIERS.map((t) => [t.name, t.rides ? `${t.rides} rides · ${a.commission_percent + t.bonus}%` : `${a.commission_percent}%`]);
  const card = "rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(33,23,38,.06)]";
  return <main className="font-home min-h-dvh bg-[#F4F5F8] text-[#211726]">
    <div className="bg-[linear-gradient(180deg,#FE8B05,#FFA94D)] px-4 pb-20 pt-[calc(18px+env(safe-area-inset-top))] text-white">
      <div className="mx-auto max-w-[720px]">
        <WaydidiLogo className="h-[34px] w-auto text-white" />
        <p className="mt-6 text-[14px] opacity-95">Hi {a.name} · Waydidi partner{a.status === "paused" ? " (paused)" : ""}</p>
        <h1 className="mt-1 text-[26px] font-bold">This month ({d.monthName})</h1>
      </div>
    </div>
    <div className="mx-auto -mt-14 grid max-w-[720px] gap-4 px-4 pb-12">
      {a.status === "paused" && <p className="rounded-2xl bg-amber-50 p-4 text-[14px] text-amber-900">Your link and code are paused at the moment. Please contact Waydidi.</p>}
      <section className={`${card} grid grid-cols-2 gap-3 sm:grid-cols-4`}>
        {[["Link clicks", String(d.month.clicks), ""], ["Bookings", String(d.month.bookings), ""], ["Earned (to be paid)", thb(d.owed), "text-[#2F7A6B]"], ["Pending (upcoming rides)", thb(d.pending), "text-amber-700"]].map(([k, v, c]) =>
          <div key={k} className="rounded-xl bg-slate-50 p-3"><p className="text-[12px] text-slate-500">{k}</p><p className={`mt-1 text-[22px] font-bold ${c}`}>{v}</p></div>)}
        <p className="col-span-full text-[13px] text-slate-500">Paid to you so far: <b className="text-[#211726]">{thb(d.paid)}</b> · Completed rides: <b className="text-[#211726]">{d.completedRides}</b></p>
      </section>

      <section className={card}>
        <div className="flex items-baseline justify-between gap-3"><h2 className="text-[18px] font-bold">{d.tier} partner</h2><p className="text-[15px] font-semibold text-[#C96100]">You earn {d.rate}%</p></div>
        {d.next ? <>
          <p className="mt-1 text-[14px] text-slate-600">{d.next.ridesToNext} more completed {d.next.ridesToNext === 1 ? "ride" : "rides"} to reach <b>{d.next.name} · {d.next.rate}%</b></p>
          <div className="mt-3 h-2.5 rounded-full bg-slate-100"><div className="h-2.5 rounded-full bg-[#FE8B05]" style={{ width: `${Math.max(4, Math.min(100, d.next.progress))}%` }} /></div>
        </> : <p className="mt-1 text-[14px] text-slate-600">You&apos;re at the top tier. Thank you for sending us so many travellers!</p>}
        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[12.5px]">{TIER_ROWS.map(([n, r]) => <div key={n} className={`rounded-xl p-2 ${n === d.tier ? "border border-[#FE8B05] bg-[#FFF0DF] font-semibold text-[#C96100]" : "bg-slate-50 text-slate-600"}`}>{n}<br />{r}</div>)}</div>
      </section>

      <section className={card}>
        <h2 className="text-[18px] font-bold">Your link and code</h2>
        <p className="mt-1 text-[14px] text-slate-600">You earn <b>{a.commission_percent}%</b> of what the customer pays when the ride is completed. With your code, your customers get <b>{a.discount_percent}% off</b>.</p>
        <div className="mt-3 grid gap-2">
          <CopyRow label="waydidi.com/?ref=" value={`https://waydidi.com/?ref=${a.slug}`} shown={<><span className="text-slate-500">waydidi.com/?ref=</span><b className="text-[#C96100]">{a.slug}</b></>} />
          <CopyRow label="Code" value={a.code} shown={<><span className="text-slate-500">Code </span><b className="text-[#C96100]">{a.code}</b><span className="text-slate-500"> · {a.discount_percent}% off for your customers</span></>} />
        </div>
        <div className="mt-3"><PartnerQr url={`https://waydidi.com/?ref=${a.slug}`} name={a.name} code={a.code} discount={a.discount_percent} /></div>
        <h3 className="mt-5 text-[15px] font-bold">Link builder</h3>
        <p className="mb-2 text-[13px] text-slate-500">Make a link with the route already filled in, e.g. for a post about Phuket airport to Patong.</p>
        <LinkBuilder slug={a.slug} />
      </section>

      <section className={card}>
        <h2 className="text-[18px] font-bold">Recent bookings</h2>
        {d.recent.length === 0 ? <p className="mt-2 text-[14px] text-slate-500">No bookings yet. Share your link or code to get started.</p> :
          <ul className="mt-2 divide-y divide-slate-100">{d.recent.map((r, i) => <li key={i} className="flex items-center gap-3 py-3 text-[14px]">
            <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{short(r.from)} → {short(r.to)}</span><span className="text-[12.5px] text-slate-500">{r.date} · via {r.via === "code" ? "code" : "link"}</span></span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${STATE[r.state][1]}`}>{thb(r.commission)} {STATE[r.state][0].toLowerCase()}</span>
          </li>)}</ul>}
      </section>
      <p className="text-center text-[12.5px] text-slate-500">Commission is earned when the ride is completed; cancelled rides earn nothing. Payments are made monthly. Questions? WhatsApp +66 63 206 4884.<br />Keep this page link private: it opens your dashboard without a password.</p>
    </div>
  </main>;
}
