"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PlacePicker } from "@/components/trip-planner/place-picker";

type Car = { id: string; name: string; seats: number; price: number };
type Quote = { ok: boolean; errors: string[]; total: number; feesOnSite: number; returnAt: string | null; timeline: { name: string; start: string; end: string }[] };

const input = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-[15px] outline-none focus:border-brand";
const label = "grid gap-1 text-[13px] font-bold text-slate-700";
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;

async function post<T>(slug: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/packages/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({})) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
  return data;
}

/** Date, hotel and group → live check of the day (opening hours, sessions) → contact → payment. */
export function PackageBooking({ slug, startTimes, cars, minDate }: { slug: string; startTimes: string[]; cars: Car[]; minDate: string }) {
  const [b, setB] = useState({ date: "", startTime: startTimes[0] ?? "", pickupText: "", pickupLat: null as number | null, pickupLng: null as number | null, adults: 2, children: 0, vehicle: cars[0]?.id ?? "" });
  const [contact, setContact] = useState({ name: "", email: "", phone: "", agree: false });
  const [result, setResult] = useState<{ key: string; quote: Quote | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = b.date && b.startTime && b.pickupText.trim().length > 1 && b.vehicle;
  const key = useMemo(() => JSON.stringify(b), [b]);

  // Re-check the day whenever the details change (debounced).
  useEffect(() => {
    if (!ready) return;
    let live = true;
    const t = setTimeout(() => { setError(""); post<Quote>(slug, JSON.parse(key)).then((q) => { if (live) setResult({ key, quote: q }); }).catch((e: Error) => { if (live) { setResult({ key, quote: null }); setError(e.message); } }); }, 500);
    return () => { live = false; clearTimeout(t); };
  }, [key, ready, slug]);
  const quote = ready && result?.key === key ? result.quote : null;

  const book = async () => {
    setBusy(true); setError("");
    try {
      const r = await post<{ checkoutUrl: string }>(slug, { ...b, ...contact, language: "en", action: "book" });
      window.location.href = r.checkoutUrl;
    } catch (e) { setError((e as Error).message); setBusy(false); }
  };

  if (!cars.length) return <div className="rounded-[22px] bg-canvas p-5">This trip isn&apos;t bookable online yet. Chat with us to arrange it.</div>;
  const set = (patch: Partial<typeof b>) => setB((x) => ({ ...x, ...patch }));

  return <div className="grid gap-4 rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-xl font-black">Book this trip</h2>
    <div className="grid grid-cols-2 gap-3">
      <label className={label}>Date<input type="date" min={minDate} className={input} value={b.date} onChange={(e) => set({ date: e.target.value })} /></label>
      <label className={label}>Start time<select className={input} value={b.startTime} onChange={(e) => set({ startTime: e.target.value })}>{startTimes.map((t) => <option key={t}>{t}</option>)}</select></label>
    </div>
    <label className={label}>Hotel or pickup address<PlacePicker className={input} value={b.pickupText} placeholder="Search your hotel" onChange={(p) => set({ pickupText: p.text, pickupLat: p.lat, pickupLng: p.lng })} /></label>
    <div className="grid grid-cols-2 gap-3">
      <label className={label}>Adults<input type="number" min={1} max={20} className={input} value={b.adults} onChange={(e) => set({ adults: Math.max(1, Number(e.target.value) || 1) })} /></label>
      <label className={label}>Children<input type="number" min={0} max={10} className={input} value={b.children} onChange={(e) => set({ children: Math.max(0, Number(e.target.value) || 0) })} /></label>
    </div>
    <fieldset className="grid gap-2"><legend className="mb-1 text-[13px] font-bold text-slate-700">Car</legend>
      {cars.map((c) => <label key={c.id} className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-[15px] ${b.vehicle === c.id ? "border-brand bg-orange-50" : "border-slate-200"} ${b.adults + b.children > c.seats ? "opacity-50" : ""}`}>
        <span className="flex items-center gap-2"><input type="radio" name="car" checked={b.vehicle === c.id} onChange={() => set({ vehicle: c.id })} />{c.name} · {c.seats} seats</span><span className="font-bold">{thb(c.price)}</span>
      </label>)}
    </fieldset>

    {quote && <div className="grid gap-2 rounded-xl bg-canvas p-4 text-[14px]">
      {quote.errors.length > 0 ? <ul className="grid gap-1 text-red-700">{quote.errors.map((x) => <li key={x}>{x}</li>)}</ul> : <>
        <ol className="grid gap-1">{quote.timeline.map((s, i) => <li key={i} className="flex justify-between gap-3"><span>{s.name}</span><span className="shrink-0 tabular-nums text-slate-600">{s.start}–{s.end}</span></li>)}</ol>
        {quote.returnAt && <p className="text-slate-600">Back at your hotel around {quote.returnAt}</p>}
        <p className="flex justify-between border-t border-slate-200 pt-2 text-[16px] font-black"><span>Total</span><span>{thb(quote.total)}</span></p>
        {quote.feesOnSite > 0 && <p className="text-slate-600">Plus {thb(quote.feesOnSite)} paid on site.</p>}
      </>}
    </div>}

    {quote?.ok && <div className="grid gap-3">
      <input className={input} placeholder="Full name" autoComplete="name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
      <input className={input} type="email" placeholder="Email" autoComplete="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
      <input className={input} type="tel" placeholder="Phone or WhatsApp" autoComplete="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
      <label className="flex gap-2 text-[13px] text-slate-600"><input type="checkbox" checked={contact.agree} onChange={(e) => setContact({ ...contact, agree: e.target.checked })} />I accept the <Link href="/terms" className="underline">terms</Link> and cancellation policy.</label>
      <button onClick={book} disabled={busy} className="h-12 rounded-full bg-brand font-black text-white hover:bg-brand-strong disabled:opacity-60">{busy ? "Opening payment…" : `Pay ${thb(quote.total)}`}</button>
    </div>}
    {!ready && <p className="text-[13px] text-slate-500">Choose a date and your hotel to see the timing and total.</p>}
    {error && <p className="text-[14px] text-red-600">{error}</p>}
  </div>;
}
