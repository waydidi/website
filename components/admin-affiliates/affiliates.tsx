"use client";

import { Check, Copy, Plus, X } from "lucide-react";
import { Fragment, useCallback, useEffect, useState } from "react";
import { PartnerQr } from "@/components/partner/tools";
import { KIT_ROUTES } from "@/lib/partner-kit";

type Row = {
  id: string; slug: string; code: string; name: string; email: string | null; phone: string | null; kind: string;
  commission_percent: number; discount_percent: number; status: string; notes: string | null;
  clicks30: number; bookings: number; sales: number; pending: number; earned: number; paid: number; dashboardUrl: string;
  website?: string | null; audience?: string | null; pitch?: string | null; created_at?: string; completed: number; tier: string; rate: number;
};
type Payout = { id: string; name: string; email: string | null; phone: string | null; notes: string | null; rides: number; amount: number; unpaid: number; paid_at: string | null };
type Booking = { booking_reference: string; via: string; fare_before_discount: number; discount: number; commission: number; paid_at: string | null; customer_name: string; pickup_date: string; pickup: string; dropoff: string; state: "pending" | "earned" | "cancelled" };

const thb = (n: number) => `฿${n.toLocaleString("en-US")}`;
const KINDS: [string, string][] = [["creator", "Blogger / creator"], ["hotel", "Hotel / stay"], ["guide", "Guide / tours"], ["business", "Local business"], ["other", "Other"]];
const EMPTY = { id: "", name: "", slug: "", code: "", email: "", phone: "", kind: "creator", commissionPercent: "8", discountPercent: "5", status: "active", notes: "" };
const box = "rounded-2xl border border-slate-200 bg-white";

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return <button type="button" onClick={() => { void navigator.clipboard.writeText(text).then(() => { setDone(true); window.setTimeout(() => setDone(false), 1500); }); }} aria-label={`Copy ${text}`} className="grid size-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100">{done ? <Check size={15} className="text-emerald-600" /> : <Copy size={15} />}</button>;
}

export function AdminAffiliates() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [form, setForm] = useState<typeof EMPTY | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [bookings, setBookings] = useState<Booking[] | null>(null);
  const [qr, setQr] = useState<Row | null>(null);
  const [kit, setKit] = useState<Record<string, string> | null>(null);
  const [kitMsg, setKitMsg] = useState("");
  useEffect(() => { void fetch("/api/admin/affiliates?kit=1", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { prices: {} })).then((d: { prices: Record<string, number> }) => setKit(Object.fromEntries(KIT_ROUTES.map((r) => [r.id, d.prices[r.id] ? String(d.prices[r.id]) : ""])))); }, []);
  async function saveKit() {
    setKitMsg("");
    const r = await fetch("/api/admin/affiliates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "kit-prices", prices: kit }) });
    setKitMsg(r.ok ? "Saved. Partners see the new prices in their content kit." : "Couldn't save.");
  }
  const months = Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i); return d.toISOString().slice(0, 7); });
  const [month, setMonth] = useState(months[1] ?? months[0]);
  const [payouts, setPayouts] = useState<Payout[] | null>(null);
  const loadPayouts = useCallback(async (m: string) => {
    setPayouts(null);
    const r = await fetch(`/api/admin/affiliates?payouts=${m}`, { cache: "no-store" });
    setPayouts(r.ok ? ((await r.json()) as { payouts: Payout[] }).payouts : []);
  }, []);
  useEffect(() => { const t = window.setTimeout(() => void loadPayouts(month), 0); return () => window.clearTimeout(t); }, [month, loadPayouts]);
  async function payMonth(p: Payout) {
    if (!window.confirm(`Mark ${thb(p.unpaid)} as paid to ${p.name} for ${month}?`)) return;
    await fetch("/api/admin/affiliates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pay", id: p.id, month }) });
    void loadPayouts(month); void load();
  }
  function csv() {
    if (!payouts) return;
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Partner", "Email", "Phone", "Bank / PromptPay notes", "Completed rides", "Commission (THB)", "Unpaid (THB)"].map(q).join(","),
      ...payouts.map((p) => [p.name, p.email, p.phone, p.notes, p.rides, p.amount, p.unpaid].map(q).join(","))];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" }));
    a.download = `waydidi-partner-payouts-${month}.csv`; a.click();
  }

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/affiliates", { cache: "no-store" });
    setRows(r.ok ? ((await r.json()) as { affiliates: Row[] }).affiliates : []);
  }, []);
  useEffect(() => { const t = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(t); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true); setError("");
    const r = await fetch("/api/admin/affiliates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await r.json().catch(() => ({})) as { error?: string };
    setBusy(false);
    if (!r.ok) { setError(d.error ?? "Couldn't save."); return; }
    setForm(null); void load();
  }
  async function showBookings(id: string) {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setBookings(null);
    const r = await fetch(`/api/admin/affiliates?id=${encodeURIComponent(id)}`, { cache: "no-store" });
    setBookings(r.ok ? ((await r.json()) as { bookings: Booking[] }).bookings : []);
  }
  async function decide(a: Row, action: "approve" | "decline") {
    if (action === "decline" && !window.confirm(`Decline ${a.name}'s application?`)) return;
    const r = await fetch("/api/admin/affiliates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: a.id }) });
    const d = await r.json().catch(() => ({})) as { emailed?: boolean; error?: string };
    if (!r.ok) window.alert(d.error ?? "Couldn't update.");
    else if (action === "approve") window.alert(d.emailed ? `${a.name} is approved. We emailed them their link, code and dashboard.` : `${a.name} is approved, but the welcome email couldn't be sent. Copy their dashboard link from the list and send it yourself.`);
    void load();
  }
  async function newLink(a: Row) {
    if (!window.confirm(`Make a new dashboard link for ${a.name}? The old link stops working.`)) return;
    await fetch("/api/admin/affiliates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "new-link", id: a.id }) });
    void load();
  }
  async function pay(a: Row) {
    if (!window.confirm(`Mark ${thb(a.earned)} as paid to ${a.name}? (all completed rides not yet paid)`)) return;
    await fetch("/api/admin/affiliates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pay", id: a.id }) });
    void load(); if (open === a.id) { setOpen(null); }
  }

  const applied = (rows ?? []).filter((r) => r.status === "applied");
  const partners = (rows ?? []).filter((r) => r.status === "active" || r.status === "paused");
  const totals = partners.reduce((t, r) => ({ bookings: t.bookings + r.bookings, sales: t.sales + r.sales, owed: t.owed + r.earned, pending: t.pending + r.pending }), { bookings: 0, sales: 0, owed: 0, pending: 0 });
  const field = "h-10 w-full rounded-lg border border-slate-300 px-3 text-[14px] outline-none focus:border-[#FE8B05]";

  return <div className="grid gap-4">
    <div className="grid gap-3 sm:grid-cols-4">
      {[["Bookings via partners", String(totals.bookings)], ["Sales", thb(totals.sales)], ["Commission owed (completed)", thb(totals.owed)], ["Pending (upcoming rides)", thb(totals.pending)]].map(([k, v]) =>
        <div key={k} className={`${box} p-4`}><p className="text-[12.5px] text-slate-500">{k}</p><p className="mt-1 text-[22px] font-bold">{v}</p></div>)}
    </div>

    {applied.length > 0 && <section className={`${box} border-[#F6B46E]`}>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3"><h2 className="text-[15px] font-bold">New applications</h2><span className="rounded-full bg-[#FFF0DF] px-2 py-0.5 text-[12px] font-bold text-[#C96100]">{applied.length} waiting</span></div>
      <ul className="divide-y divide-slate-100">{applied.map((a) => <li key={a.id} className="grid gap-2 px-4 py-3 text-[13.5px] sm:grid-cols-[1fr_auto] sm:items-start">
        <div className="min-w-0">
          <p className="font-semibold">{a.name} <span className="font-normal text-slate-500">· {KINDS.find(([k]) => k === a.kind)?.[1] ?? a.kind}{a.audience ? ` · ${a.audience}` : ""}</span></p>
          <p className="text-slate-600">{a.email}{a.phone ? ` · ${a.phone}` : ""}{a.website ? <> · <a href={/^https?:\/\//.test(a.website) ? a.website : `https://${a.website}`} target="_blank" rel="noreferrer" className="text-[#C96100] underline">{a.website}</a></> : null}</p>
          {a.pitch && <p className="mt-1 whitespace-pre-line rounded-lg bg-slate-50 p-2 text-slate-700">{a.pitch}</p>}
          <p className="mt-1 text-[12px] text-slate-500">Will get: waydidi.com/?ref={a.slug} · code {a.code} · {a.commission_percent}% / {a.discount_percent}% off (change with Edit before approving)</p>
        </div>
        <div className="flex gap-1.5 sm:justify-end">
          <button type="button" onClick={() => void decide(a, "approve")} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-700">Approve</button>
          <button type="button" onClick={() => { setForm({ id: a.id, name: a.name, slug: a.slug, code: a.code, email: a.email ?? "", phone: a.phone ?? "", kind: a.kind, commissionPercent: String(a.commission_percent), discountPercent: String(a.discount_percent), status: "applied", notes: a.notes ?? "" }); setError(""); }} className="rounded-lg px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-100">Edit</button>
          <button type="button" onClick={() => void decide(a, "decline")} className="rounded-lg px-3 py-1.5 font-semibold text-red-600 hover:bg-red-50">Decline</button>
        </div>
      </li>)}</ul>
    </section>}

    <section className={box}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-[15px] font-bold">Affiliate partners</h2>
        <button type="button" onClick={() => { setForm({ ...EMPTY }); setError(""); }} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#FE8B05] px-4 text-[13.5px] font-semibold text-white hover:bg-[#E67900]"><Plus size={16} />Add partner</button>
      </div>
      {rows === null ? <p className="p-4 text-slate-500">Loading…</p> : partners.length === 0 ? <p className="p-4 text-[14px] text-slate-500">No partners yet. Add your first one: they get a link like waydidi.com/?ref=name and a code for their followers.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-[13.5px]">
          <thead className="text-[12px] text-slate-500"><tr><th className="px-4 py-2">Partner</th><th>Link · code</th><th>Rate</th><th>Clicks (30d)</th><th>Bookings</th><th>Sales</th><th>Owed</th><th>Pending</th><th className="pr-4" /></tr></thead>
          <tbody className="divide-y divide-slate-100">{partners.map((a) => <Fragment key={a.id}>
            <tr className="align-middle">
              <td className="px-4 py-3"><p className="font-semibold">{a.name}{a.status === "paused" && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">Paused</span>}</p><p className="text-[12px] text-slate-500">{KINDS.find(([k]) => k === a.kind)?.[1] ?? a.kind}{a.email ? ` · ${a.email}` : ""}</p></td>
              <td><span className="flex items-center gap-1 font-mono text-[12.5px]">waydidi.com/?ref={a.slug}<CopyButton text={`https://waydidi.com/?ref=${a.slug}`} /></span><span className="flex items-center gap-1 font-mono text-[12.5px] text-[#C96100]">{a.code}<CopyButton text={a.code} /></span>
                <span className="flex items-center gap-1 text-[12px] text-slate-500">Dashboard link<CopyButton text={a.dashboardUrl} /><button type="button" onClick={() => void newLink(a)} className="font-semibold underline underline-offset-2 hover:text-[#C96100]">New</button></span></td>
              <td className="text-[12.5px]"><span className="font-semibold">{a.tier} · {a.rate}%</span> to them<br /><span className="text-slate-500">{a.discount_percent}% off with code · {a.completed} rides</span></td>
              <td>{a.clicks30}</td><td>{a.bookings}</td><td>{thb(a.sales)}</td>
              <td className="font-semibold text-emerald-700">{thb(a.earned)}</td><td className="text-amber-700">{thb(a.pending)}</td>
              <td className="whitespace-nowrap pr-4 text-right">
                <button type="button" onClick={() => setQr(a)} className="rounded-lg px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100">QR</button>
                <button type="button" onClick={() => void showBookings(a.id)} className="rounded-lg px-2 py-1 font-semibold text-[#C96100] hover:bg-[#FFF6EC]">{open === a.id ? "Hide" : "Bookings"}</button>
                <button type="button" onClick={() => { setForm({ id: a.id, name: a.name, slug: a.slug, code: a.code, email: a.email ?? "", phone: a.phone ?? "", kind: a.kind, commissionPercent: String(a.commission_percent), discountPercent: String(a.discount_percent), status: a.status, notes: a.notes ?? "" }); setError(""); }} className="rounded-lg px-2 py-1 font-semibold text-slate-600 hover:bg-slate-100">Edit</button>
                {a.earned > 0 && <button type="button" onClick={() => void pay(a)} className="ml-1 rounded-lg bg-[#211726] px-2.5 py-1 font-semibold text-white">Mark paid</button>}
              </td>
            </tr>
            {open === a.id && <tr><td colSpan={9} className="bg-slate-50 px-4 py-3">
              {bookings === null ? <p className="text-slate-500">Loading…</p> : bookings.length === 0 ? <p className="text-slate-500">No bookings yet.</p> :
                <table className="w-full text-[13px]"><thead className="text-slate-500"><tr><th className="py-1 text-left">Booking</th><th className="text-left">Ride</th><th className="text-left">Via</th><th className="text-left">Paid by customer</th><th className="text-left">Commission</th></tr></thead>
                  <tbody>{bookings.map((b) => <tr key={b.booking_reference} className="border-t border-slate-200">
                    <td className="py-1.5 font-mono">{b.booking_reference}</td><td>{b.pickup_date} · {b.customer_name} · {b.pickup} → {b.dropoff}</td><td>{b.via === "code" ? "Code" : "Link"}</td>
                    <td>{thb(b.fare_before_discount - b.discount)}{b.discount > 0 && <span className="text-slate-500"> ({thb(b.discount)} off)</span>}</td>
                    <td><span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${b.state === "cancelled" ? "bg-slate-100 text-slate-500 line-through" : b.paid_at ? "bg-emerald-50 text-emerald-700" : b.state === "earned" ? "bg-[#FFF0DF] text-[#C96100]" : "bg-amber-50 text-amber-800"}`}>{thb(b.commission)} {b.state === "cancelled" ? "cancelled" : b.paid_at ? "paid" : b.state === "earned" ? "owed" : "pending"}</span></td>
                  </tr>)}</tbody></table>}
            </td></tr>}
          </Fragment>)}</tbody>
        </table></div>}
    </section>
    <section className={box}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="text-[15px] font-bold">Monthly payouts</h2>
        <div className="flex items-center gap-2">
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Month" className="h-9 rounded-lg border border-slate-300 px-2 text-[13.5px]">{months.map((m) => <option key={m} value={m}>{new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}</option>)}</select>
          <button type="button" onClick={csv} disabled={!payouts?.length} className="h-9 rounded-lg border border-slate-300 px-3 text-[13px] font-semibold disabled:opacity-50">Download CSV</button>
        </div>
      </div>
      {payouts === null ? <p className="p-4 text-slate-500">Loading…</p> : payouts.length === 0 ? <p className="p-4 text-[14px] text-slate-500">No completed partner rides in this month.</p> :
        <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-[13.5px]">
          <thead className="text-[12px] text-slate-500"><tr><th className="px-4 py-2">Partner</th><th>Pay to (notes)</th><th>Rides</th><th>Commission</th><th>Unpaid</th><th className="pr-4" /></tr></thead>
          <tbody className="divide-y divide-slate-100">{payouts.map((p) => <tr key={p.id}>
            <td className="px-4 py-3"><p className="font-semibold">{p.name}</p><p className="text-[12px] text-slate-500">{p.email ?? ""}{p.phone ? ` · ${p.phone}` : ""}</p></td>
            <td className="max-w-[260px] whitespace-pre-line text-[12.5px] text-slate-600">{p.notes || <span className="text-slate-400">No bank details yet (add with Edit)</span>}</td>
            <td>{p.rides}</td><td>{thb(p.amount)}</td>
            <td className={p.unpaid ? "font-semibold text-emerald-700" : "text-slate-400"}>{p.unpaid ? thb(p.unpaid) : "Paid"}</td>
            <td className="pr-4 text-right">{p.unpaid > 0 && <button type="button" onClick={() => void payMonth(p)} className="rounded-lg bg-[#211726] px-3 py-1.5 font-semibold text-white">Mark paid</button>}</td>
          </tr>)}</tbody>
        </table></div>}
      <p className="border-t border-slate-100 px-4 py-2 text-[12px] text-slate-500">Rides count in the month of their pickup date, once completed. Tiers: Silver after 10 completed rides (+2%), Gold after 30 (+4%), on top of each partner&apos;s own rate; the rate is fixed on each booking when it&apos;s made.</p>
    </section>

    <section className={box}>
      <div className="border-b border-slate-100 px-4 py-3"><h2 className="text-[15px] font-bold">Content kit prices</h2><p className="text-[12.5px] text-slate-500">&quot;From&quot; price per car shown in the partners&apos; ready-made captions (EN / TH / ZH). Leave empty to leave the price out.</p></div>
      {kit && <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">{KIT_ROUTES.map((r) => <label key={r.id} className="grid gap-1 text-[13px] font-semibold">{r.title.en}
        <span className="flex items-center rounded-lg border border-slate-300 px-3 focus-within:border-[#FE8B05]"><span className="text-slate-400">฿</span><input inputMode="numeric" value={kit[r.id] ?? ""} onChange={(e) => setKit({ ...kit, [r.id]: e.target.value.replace(/\D/g, "") })} placeholder="e.g. 1200" className="h-10 w-full bg-transparent px-1.5 font-normal outline-none" /></span>
      </label>)}</div>}
      <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3"><button type="button" onClick={() => void saveKit()} className="h-9 rounded-lg bg-[#211726] px-4 text-[13px] font-semibold text-white">Save prices</button>{kitMsg && <span className="text-[13px] font-semibold text-[#C96100]">{kitMsg}</span>}</div>
    </section>

    {qr && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#211726]/50 p-4" role="dialog" aria-modal="true" aria-label={`QR for ${qr.name}`} onClick={(e) => e.target === e.currentTarget && setQr(null)}>
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <button type="button" onClick={() => setQr(null)} aria-label="Close" className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        <h2 className="text-[18px] font-bold">{qr.name}</h2><p className="mb-3 text-[13px] text-slate-500">waydidi.com/?ref={qr.slug}</p>
        <PartnerQr url={`https://waydidi.com/?ref=${qr.slug}`} name={qr.name} code={qr.code} discount={qr.discount_percent} />
      </div>
    </div>}

    <p className="text-[12.5px] text-slate-500">Commission is earned when the ride is completed, on what the customer actually paid. Cancelled rides earn nothing. A partner link is remembered for 30 days (the last link clicked wins); a partner&apos;s code also gives the customer their discount. Partners can&apos;t earn on their own bookings, and store (QR) bookings don&apos;t count.</p>

    {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#211726]/50 p-4" role="dialog" aria-modal="true" aria-labelledby="aff-form">
      <form onSubmit={save} className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <button type="button" onClick={() => setForm(null)} aria-label="Close" className="absolute right-3 top-3 grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        <h2 id="aff-form" className="text-[20px] font-bold">{form.id ? "Edit partner" : "Add partner"}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[13px] font-semibold sm:col-span-2">Name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={field} placeholder="e.g. Mint Travels" /></label>
          <label className="grid gap-1 text-[13px] font-semibold">Link name<input required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} className={field} placeholder="mint" /><span className="font-normal text-slate-500">waydidi.com/?ref={form.slug || "…"}</span></label>
          <label className="grid gap-1 text-[13px] font-semibold">Code<input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} className={field} placeholder="MINT5" /><span className="font-normal text-slate-500">Typed in the promo code box</span></label>
          <label className="grid gap-1 text-[13px] font-semibold">Commission to partner (%)<input required inputMode="decimal" value={form.commissionPercent} onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })} className={field} /></label>
          <label className="grid gap-1 text-[13px] font-semibold">Customer discount with code (%)<input required inputMode="decimal" value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} className={field} /></label>
          <label className="grid gap-1 text-[13px] font-semibold">Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={field} /></label>
          <label className="grid gap-1 text-[13px] font-semibold">Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={field} /></label>
          <label className="grid gap-1 text-[13px] font-semibold">Type<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} className={field}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <label className="grid gap-1 text-[13px] font-semibold">Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={field}>{form.status === "applied" && <option value="applied">Waiting for approval</option>}<option value="active">Active</option><option value="paused">Paused (link and code stop working)</option></select></label>
          <label className="grid gap-1 text-[13px] font-semibold sm:col-span-2">Notes (bank / PromptPay, agreement…)<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full rounded-lg border border-slate-300 p-3 text-[14px] outline-none focus:border-[#FE8B05]" /></label>
        </div>
        {error && <p role="alert" className="mt-3 text-[14px] text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="mt-5 h-11 w-full rounded-xl bg-[#FE8B05] font-semibold text-white hover:bg-[#E67900] disabled:opacity-60">{busy ? "Saving…" : "Save partner"}</button>
      </form>
    </div>}
  </div>;
}
