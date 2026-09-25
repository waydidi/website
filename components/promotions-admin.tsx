"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { listPromotions } from "@/lib/promo-admin";

type Row = Awaited<ReturnType<typeof listPromotions>>[number];
const VEHICLES = [["economy_sedan", "Economy sedan"], ["comfort_bmw", "Comfort BMW"], ["comfort_suv", "Comfort SUV"], ["premium_minivan", "Premium Minivan"]] as const;
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;
const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 16) : "");
const fromLocal = (value: string) => (value ? new Date(`${value}:00+07:00`).toISOString() : null);

type Form = {
  id?: string; code: string; title: string; discountType: "percent" | "fixed"; discountValue: string; maxDiscount: string; minFare: string;
  startsAt: string; endsAt: string; maxUses: string; perCustomerLimit: string; firstBookingOnly: boolean; service: "any" | "transfer" | "hourly" | "return";
  vehicles: string[]; offerTerms: string; showOnHomepage: boolean; status: "draft" | "active" | "paused";
};
const EMPTY: Form = { code: "", title: "", discountType: "percent", discountValue: "10", maxDiscount: "", minFare: "0", startsAt: "", endsAt: "", maxUses: "", perCustomerLimit: "1", firstBookingOnly: false, service: "any", vehicles: [], offerTerms: "", showOnHomepage: true, status: "draft" };

function toForm(p: Row): Form {
  let vehicles: string[] = [], terms: string[] = [];
  try { vehicles = JSON.parse(p.vehiclesJson ?? "[]"); } catch { /* none */ }
  try { terms = JSON.parse(p.offerTermsJson ?? "[]"); } catch { /* none */ }
  return { id: p.id, code: p.code, title: p.title, discountType: p.discountType === "fixed" ? "fixed" : "percent", discountValue: String(p.discountValue), maxDiscount: p.maxDiscount == null ? "" : String(p.maxDiscount), minFare: String(p.minFare), startsAt: toLocal(p.startsAt), endsAt: toLocal(p.endsAt), maxUses: p.maxUses == null ? "" : String(p.maxUses), perCustomerLimit: String(p.perCustomerLimit), firstBookingOnly: p.firstBookingOnly, service: (p.service as Form["service"]) ?? "any", vehicles, offerTerms: terms.join("\n"), showOnHomepage: p.showOnHomepage, status: (p.status as Form["status"]) ?? "draft" };
}


export function PromotionsAdmin({ promotions }: { promotions: Row[] }) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [viewing, setViewing] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  async function save(override?: Partial<Form>, base?: Form) {
    const f = { ...(base ?? form)!, ...override };
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/admin/promotions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: f.id, code: f.code, title: f.title, discountType: f.discountType, discountValue: Number(f.discountValue), maxDiscount: num(f.maxDiscount),
          minFare: Number(f.minFare || 0), startsAt: fromLocal(f.startsAt), endsAt: fromLocal(f.endsAt), maxUses: num(f.maxUses), perCustomerLimit: Number(f.perCustomerLimit || 1),
          firstBookingOnly: f.firstBookingOnly, service: f.service, vehicles: f.vehicles, offerTerms: f.offerTerms.split("\n").map((l) => l.trim()).filter(Boolean),
          showOnHomepage: f.showOnHomepage, status: f.status,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) { setError(body.error ?? "Couldn't save."); return false; }
      setForm(null); router.refresh(); return true;
    } catch { setError("Couldn't save. Check your connection."); return false; }
    finally { setSaving(false); }
  }

  const input = "mt-1 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 outline-none focus:border-[#FF8A05]";
  return <>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
      <span />
      <button type="button" onClick={() => { setError(""); setForm({ ...EMPTY }); }} className="rounded-full bg-[#FF8A05] px-5 py-2.5 text-sm font-bold text-white">New promotion</button>
    </div>
    <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{["Code", "Offer", "Rules", "Discount given", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody>
          {promotions.length === 0 && <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-500">No promotions yet.</td></tr>}
          {promotions.map((p) => <tr key={p.id} className="border-t border-slate-100 align-top">
            <td className="px-4 py-3 font-bold tracking-wide">{p.code}{p.showOnHomepage && <span className="mt-1 block text-[11px] font-semibold text-[#C96100]">Homepage</span>}</td>
            <td className="px-4 py-3">{p.title}<span className="mt-1 block text-slate-500">{p.discountType === "percent" ? `${p.discountValue}%${p.maxDiscount ? ` up to ${thb(p.maxDiscount)}` : ""}` : thb(p.discountValue)}</span></td>
            <td className="px-4 py-3 text-slate-600">{[p.minFare ? `Min ${thb(p.minFare)}` : null, p.service !== "any" ? (p.service === "hourly" ? "Hourly only" : p.service === "return" ? "Round trips only" : "Transfers only") : null, p.firstBookingOnly ? "First booking" : null, `${p.perCustomerLimit}× per customer`].filter(Boolean).join(" · ")}</td>
            <td className="px-4 py-3">{thb(p.discountGiven)}</td>
            <td className="px-4 py-3">
              <label className="inline-flex cursor-pointer items-center gap-2">
                <button type="button" role="switch" aria-checked={p.status === "active"} aria-label={`${p.code} ${p.status === "active" ? "on" : "off"}`} disabled={saving} onClick={() => save({ status: p.status === "active" ? "paused" : "active" }, toForm(p))} className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${p.status === "active" ? "bg-emerald-500" : "bg-slate-300"}`}>
                  <span className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${p.status === "active" ? "translate-x-5" : ""}`} />
                </button>
                <span className={`text-xs font-bold ${p.status === "active" ? "text-emerald-700" : "text-slate-500"}`}>{p.status === "active" ? "On" : p.status === "draft" ? "Draft" : "Off"}</span>
              </label>
            </td>
            <td className="px-4 py-3 text-right">
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setViewing(p)} aria-label={`Period and uses for ${p.code}`} title="Period and uses" className="grid size-8 place-items-center rounded-full border border-slate-300 text-slate-600 hover:border-[#FF8A05] hover:text-[#C96100]"><Eye size={15} /></button>
                <button type="button" onClick={() => { setError(""); setForm(toForm(p)); }} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-bold">Edit</button>
              </div>
            </td>
          </tr>)}
        </tbody>
      </table>
    </div>

    <Sheet open={viewing != null} onOpenChange={(open) => { if (!open) setViewing(null); }}>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[92dvh] overflow-y-auto rounded-t-[32px] border-0 bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 text-[#1f1726] data-[state=open]:duration-500 motion-reduce:duration-0 sm:px-8 lg:left-1/2 lg:max-w-xl lg:-translate-x-1/2">
        <div className="mx-auto h-1.5 w-16 rounded-full bg-slate-300" aria-hidden="true" />
        <SheetHeader className="flex-row items-center justify-between px-0 pb-2 pt-5 text-left">
          <div className="min-w-0">
            <SheetTitle className="truncate text-[26px] font-semibold tracking-[-.03em]">{viewing?.code}</SheetTitle>
            <SheetDescription className="truncate text-slate-500">{viewing?.title}</SheetDescription>
          </div>
          <button type="button" onClick={() => setViewing(null)} className="grid size-12 shrink-0 place-items-center rounded-full bg-slate-100 transition hover:bg-orange-50" aria-label="Close"><X size={25} /></button>
        </SheetHeader>
        {viewing && <dl className="grid gap-3 py-4">
          <div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[13px] font-semibold text-slate-500">Period</dt><dd className="mt-1 text-[18px] font-bold">{viewing.startsAt ? new Date(viewing.startsAt).toLocaleDateString("en-GB") : "Now"} – {viewing.endsAt ? new Date(viewing.endsAt).toLocaleDateString("en-GB") : "open"}</dd></div>
          <div className="rounded-2xl bg-slate-50 p-4"><dt className="text-[13px] font-semibold text-slate-500">Uses</dt><dd className="mt-1 text-[18px] font-bold">{viewing.uses}{viewing.maxUses != null ? ` / ${viewing.maxUses}` : " (no limit)"}</dd></div>
        </dl>}
      </SheetContent>
    </Sheet>
    {error && !form && <p role="alert" className="mt-3 text-sm font-semibold text-red-700">{error}</p>}

    {form && <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={form.id ? "Edit promotion" : "New promotion"}>
      <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-black">{form.id ? "Edit promotion" : "New promotion"}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Code<input required value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} className={`${input} uppercase tracking-wide`} placeholder="NEWUSER20" /></label>
          <label className="text-sm font-semibold">Status<select value={form.status} onChange={(e) => set("status", e.target.value as Form["status"])} className={input}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option></select></label>
          <label className="text-sm font-semibold sm:col-span-2">Title shown to customers<input required value={form.title} onChange={(e) => set("title", e.target.value)} className={input} placeholder="[New Users] 10% off your first private transfer" /></label>
          <label className="text-sm font-semibold">Discount type<select value={form.discountType} onChange={(e) => set("discountType", e.target.value as Form["discountType"])} className={input}><option value="percent">Percentage (%)</option><option value="fixed">Fixed amount (THB)</option></select></label>
          <label className="text-sm font-semibold">{form.discountType === "percent" ? "Percent off" : "THB off"}<input required type="number" min={1} value={form.discountValue} onChange={(e) => set("discountValue", e.target.value)} className={input} /></label>
          {form.discountType === "percent" && <label className="text-sm font-semibold">Maximum discount (THB, optional)<input type="number" min={0} value={form.maxDiscount} onChange={(e) => set("maxDiscount", e.target.value)} className={input} /></label>}
          <label className="text-sm font-semibold">Minimum fare (THB)<input type="number" min={0} value={form.minFare} onChange={(e) => set("minFare", e.target.value)} className={input} /></label>
          <label className="text-sm font-semibold">Starts (Bangkok time, optional)<input type="datetime-local" value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} className={input} /></label>
          <label className="text-sm font-semibold">Ends (Bangkok time, optional)<input type="datetime-local" value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} className={input} /></label>
          <label className="text-sm font-semibold">Total uses allowed (optional)<input type="number" min={0} value={form.maxUses} onChange={(e) => set("maxUses", e.target.value)} className={input} placeholder="Unlimited" /></label>
          <label className="text-sm font-semibold">Uses per customer<input type="number" min={1} value={form.perCustomerLimit} onChange={(e) => set("perCustomerLimit", e.target.value)} className={input} /></label>
          <label className="text-sm font-semibold">Service<select value={form.service} onChange={(e) => set("service", e.target.value as Form["service"])} className={input}><option value="any">Transfers and hourly</option><option value="transfer">Transfers only</option><option value="hourly">Hourly driver only</option><option value="return">Round trip transfers only</option></select></label>
          <fieldset className="text-sm font-semibold sm:col-span-2"><legend>Cars (none ticked = all cars)</legend>
            <div className="mt-2 flex flex-wrap gap-3 font-normal">{VEHICLES.map(([id, name]) => <label key={id} className="flex items-center gap-2"><input type="checkbox" checked={form.vehicles.includes(id)} onChange={(e) => set("vehicles", e.target.checked ? [...form.vehicles, id] : form.vehicles.filter((v) => v !== id))} className="size-4 accent-[#FF8A05]" />{name}</label>)}</div>
          </fieldset>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.firstBookingOnly} onChange={(e) => set("firstBookingOnly", e.target.checked)} className="size-4 accent-[#FF8A05]" />First booking only</label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.showOnHomepage} onChange={(e) => set("showOnHomepage", e.target.checked)} className="size-4 accent-[#FF8A05]" />Show on homepage</label>
          <label className="text-sm font-semibold sm:col-span-2">Extra terms (one per line, shown in T&amp;C)<textarea value={form.offerTerms} onChange={(e) => set("offerTerms", e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 outline-none focus:border-[#FF8A05]" /></label>
        </div>
        {error && <p role="alert" className="mt-4 text-sm font-semibold text-red-700">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={() => setForm(null)} className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-bold">Cancel</button>
          <button type="submit" disabled={saving} className="rounded-full bg-[#FF8A05] px-6 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>}
  </>;
}
