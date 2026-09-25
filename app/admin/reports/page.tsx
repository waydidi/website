import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { RevenueChart } from "@/components/admin-overview/revenue-chart";
import { MarkPaid } from "@/components/admin-reports/mark-paid";
import { requireWaydidiAdmin } from "@/lib/admin";
import { bangkokDate } from "@/lib/admin-overview";
import { driverPayouts, revenueReport } from "@/lib/reports";
import { VEHICLES } from "@/lib/vehicles";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reports · Waydidi operations", robots: { index: false, follow: false } };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;
const vehicleName = (id: string) => (VEHICLES as Record<string, { name: string }>)[id]?.name ?? id;
const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthName = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

function presets() {
  const today = bangkokDate();
  const [y, m] = today.split("-").map(Number);
  const first = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, "0")}-01`;
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);
  const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
  return [
    { id: "this-month", label: "This month", from: first(y, m), to: last(y, m) },
    { id: "last-month", label: "Last month", from: first(py, pm), to: last(py, pm) },
    { id: "last-30", label: "Last 30 days", from: bangkokDate(-29), to: today },
    { id: "this-year", label: "This year", from: `${y}-01-01`, to: `${y}-12-31` },
  ];
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" }) {
  return <div className={`rounded-2xl border p-4 ${tone === "warn" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`}>
    <p className="text-[13px] font-semibold text-slate-500">{label}</p>
    <p className="mt-1 text-[22px] font-black tracking-[-.02em]">{value}</p>
    {sub && <p className="mt-0.5 text-[12px] text-slate-500">{sub}</p>}
  </div>;
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full text-left text-[13px]">
    <thead className="border-b bg-slate-50 text-[12px] uppercase text-slate-500"><tr>{head.map((h, i) => <th key={h} className={`p-3 ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-b last:border-0">{r.map((c, j) => <td key={j} className={`p-3 ${j ? "text-right tabular-nums" : "font-semibold"}`}>{c}</td>)}</tr>)}</tbody>
  </table></div>;
}

// Revenue by trip date, and what each driver is owed per week.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ range?: string; from?: string; to?: string; by?: string; tab?: string }> }) {
  const access = await requireWaydidiAdmin("/admin/reports");
  if (!access.authorized) return <AdminKeyLogin configured={access.configured} />;
  const q = await searchParams;
  const list = presets();
  const custom = q.from && q.to && DATE.test(q.from) && DATE.test(q.to) && q.from <= q.to;
  const preset = list.find((p) => p.id === q.range) ?? list[0];
  const from = custom ? q.from! : preset.from, to = custom ? q.to! : preset.to;
  const by = q.by === "month" ? "month" : "day";
  const tab = q.tab === "payouts" ? "payouts" : "revenue";
  const [report, payouts] = await Promise.all([revenueReport({ from, to }, by), tab === "payouts" ? driverPayouts({ from, to }) : Promise.resolve([])]);
  const { total } = report;
  const qs = (extra: Record<string, string>) => new URLSearchParams({ ...(custom ? { from, to } : { range: preset.id }), by, tab, ...extra }).toString();
  const chart = by === "day" ? (() => {
    const map = new Map(report.periods);
    const days: { day: string; bookings: number; revenue: number }[] = [];
    for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`) && days.length < 400; d = new Date(d.getTime() + 86_400_000)) {
      const k = d.toISOString().slice(0, 10); days.push({ day: k, bookings: map.get(k)?.trips ?? 0, revenue: map.get(k)?.revenue ?? 0 });
    }
    return days;
  })() : null;
  const payoutTotals = payouts.reduce((a, g) => ({ owed: a.owed + g.owed, paid: a.paid + g.paid, unpaid: a.unpaid + g.unpaid, missing: a.missing + g.costMissing }), { owed: 0, paid: 0, unpaid: 0, missing: 0 });

  return <main className="min-h-screen bg-[#F6F7F9] px-4 py-6 text-[#1f1726] sm:px-8">
    <div className="mx-auto grid max-w-[1200px] gap-5">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 pt-2">
        {list.map((p) => <Link key={p.id} href={`?${new URLSearchParams({ range: p.id, by, tab })}`} className={`rounded-full px-4 py-2 text-[13px] font-bold ${!custom && p.id === preset.id ? "bg-[#1f1726] text-white" : "border border-slate-200 bg-white"}`}>{p.label}</Link>)}
        <form className="flex flex-wrap items-center gap-2" action="">
          <input type="hidden" name="by" value={by} /><input type="hidden" name="tab" value={tab} />
          <input type="date" name="from" defaultValue={from} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px]" aria-label="From" />
          <span className="text-slate-400">–</span>
          <input type="date" name="to" defaultValue={to} className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px]" aria-label="To" />
          <button className="h-9 rounded-lg border border-slate-300 bg-white px-3 text-[13px] font-bold">Apply</button>
        </form>
      </div>
      <p className="-mt-2 text-[13px] text-slate-500">{nice(from)} – {nice(to)} · by trip date · confirmed and completed trips only</p>

      <div className="flex gap-1 border-b border-slate-200">
        {(["revenue", "payouts"] as const).map((t) => <Link key={t} href={`?${qs({ tab: t })}`} className={`-mb-px border-b-2 px-4 py-2 text-[14px] font-bold ${tab === t ? "border-[#FF8A05] text-[#1f1726]" : "border-transparent text-slate-500"}`}>{t === "revenue" ? "Revenue" : "Driver payouts"}</Link>)}
      </div>

      {tab === "revenue" ? <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Trips" value={String(total.trips)} />
          <Stat label="Revenue" value={thb(total.revenue)} sub={total.trips ? `avg ${thb(Math.round(total.revenue / total.trips))}` : undefined} />
          <Stat label="Discounts given" value={thb(total.discounts)} sub="promo codes + member discounts" />
          <Stat label="Driver cost" value={thb(total.driverCost)} />
          <Stat label="Margin" value={thb(total.margin)} sub="revenue − driver cost" />
        </div>
        {total.costMissing > 0 && <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[13px] font-semibold text-amber-900">{total.costMissing} trip{total.costMissing === 1 ? " has" : "s have"} no driver cost set yet, so driver cost and margin are incomplete. Set costs in <Link href="/admin/dispatch" className="underline">Driver dispatch</Link>.</p>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">{(["day", "month"] as const).map((b) => <Link key={b} href={`?${qs({ by: b })}`} className={`rounded-full px-3 py-1.5 text-[13px] font-bold ${by === b ? "bg-[#FFF0DF] text-[#C96100]" : "text-slate-500"}`}>By {b}</Link>)}</div>
          <a href={`/api/admin/reports/export?${new URLSearchParams({ type: "revenue", from, to })}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-[13px] font-bold"><Download size={15} aria-hidden="true" />Export trips (CSV)</a>
        </div>
        {chart && chart.length > 1 && <div className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-[14px] font-bold">Revenue per day</p><div className="mt-2"><RevenueChart data={chart} /></div></div>}
        <Table head={[by === "month" ? "Month" : "Day", "Trips", "Revenue", "Discounts", "Driver cost", "Margin"]} rows={report.periods.length ? report.periods.map(([k, t]) => [by === "month" ? monthName(k) : nice(k), t.trips, thb(t.revenue), thb(t.discounts), thb(t.driverCost) + (t.costMissing ? ` (${t.costMissing} missing)` : ""), thb(t.margin)]) : [["No trips in this period", "", "", "", "", ""]]} />
        <div className="grid gap-4 lg:grid-cols-3">
          <div><p className="mb-2 text-[14px] font-bold">Card vs cash</p><Table head={["Payment", "Trips", "Revenue"]} rows={report.payment.map(([k, t]) => [k, t.trips, thb(t.revenue)])} /></div>
          <div><p className="mb-2 text-[14px] font-bold">By vehicle</p><Table head={["Vehicle", "Trips", "Revenue"]} rows={report.vehicles.map(([k, t]) => [vehicleName(k), t.trips, thb(t.revenue)])} /></div>
          <div><p className="mb-2 text-[14px] font-bold">Top routes</p><Table head={["Route", "Trips", "Revenue"]} rows={report.routes.map(([k, t]) => [k, t.trips, thb(t.revenue)])} /></div>
        </div>
      </> : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Owed to drivers" value={thb(payoutTotals.owed)} />
          <Stat label="Paid" value={thb(payoutTotals.paid)} />
          <Stat label="Still to pay" value={thb(payoutTotals.unpaid)} />
          <Stat label="Trips without a cost" value={String(payoutTotals.missing)} tone={payoutTotals.missing ? "warn" : undefined} sub={payoutTotals.missing ? "set them in Driver dispatch" : undefined} />
        </div>
        <div className="flex justify-end"><a href={`/api/admin/reports/export?${new URLSearchParams({ type: "payouts", from, to })}`} className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-4 py-2 text-[13px] font-bold"><Download size={15} aria-hidden="true" />Export payouts (CSV)</a></div>
        {payouts.length === 0 ? <p className="rounded-2xl bg-white p-8 text-center text-slate-500">No trips with a driver assigned in this period.</p>
          : <ul className="grid gap-3">{payouts.map((g) => <li key={`${g.driverId}-${g.week}`} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[16px] font-black">{g.driverName} <span className="text-[13px] font-semibold text-slate-500">· week of {nice(g.week)}</span></p>
                <p className="text-[13px] text-slate-500">{g.phone} · {g.bank.code || "No bank"} {g.bank.account} {g.bank.name && `(${g.bank.name})`}</p>
              </div>
              <div className="text-right">
                <p className="text-[20px] font-black">{thb(g.owed)}</p>
                {g.owed === 0 && g.costMissing > 0
                  ? <p className="text-[12px] font-bold text-amber-700">Cost not set</p>
                  : <p className={`text-[12px] font-bold ${g.state === "paid" ? "text-emerald-700" : g.state === "partly_paid" ? "text-amber-700" : "text-red-700"}`}>{g.state === "paid" ? "✓ Paid" : g.state === "partly_paid" ? `Partly paid · ${thb(g.unpaid)} to pay` : `To pay: ${thb(g.unpaid)}`}</p>}
              </div>
            </div>
            <ul className="mt-3 grid gap-1 border-t border-slate-100 pt-3 text-[13px]">{g.trips.map((t) => <li key={t.reference} className="flex flex-wrap justify-between gap-2">
              <span><Link href={`/admin/journeys/${encodeURIComponent(t.reference)}`} className="font-semibold underline">{t.reference}</Link> · {nice(t.pickupDate)} · {t.route}</span>
              <span className="tabular-nums">{t.cost == null ? <span className="font-semibold text-amber-700">cost not set</span> : <>{thb(t.cost)} {t.status === "paid" ? <span className="text-emerald-700">✓</span> : ""}</>}</span>
            </li>)}</ul>
            {g.unpaid > 0 && <div className="mt-3 border-t border-slate-100 pt-3"><MarkPaid driverId={g.driverId} week={g.week} amount={thb(g.unpaid)} /></div>}
            {g.costMissing > 0 && <p className="mt-2 text-[12px] font-semibold text-amber-700">{g.costMissing === 1 ? "1 trip without a cost isn't" : `${g.costMissing} trips without a cost aren't`} included. Set the cost in Driver dispatch first.</p>}
          </li>)}</ul>}
      </>}
    </div>
  </main>;
}
