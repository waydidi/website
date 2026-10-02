"use client";

import type { PartnerRate } from "@/lib/partner-portal";
import { Check, Copy, LoaderCircle, Plus, X } from "lucide-react";
import { useState } from "react";

type Service = "transfer" | "hourly" | "tour";

// Agency portal: create a ride request link, then fill it in now or send it to the client.
export function NewRideRequest({rates=[]}:{rates?:PartnerRate[]}) {
  const [open, setOpen] = useState(false);
  const [service, setService] = useState<Service>("transfer");
  const [rateId,setRateId]=useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  async function create() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/agency/forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceType: service, note, rateId:rateId||undefined }) });
      const out = await res.json().catch(() => ({})) as { token?: string; error?: string };
      if (!res.ok || !out.token) throw new Error(out.error ?? "Please try again.");
      setLink(`${window.location.origin}/f/${out.token}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(false); }
  }

  if (!open) return <button type="button" onClick={() => setOpen(true)} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#FF8A05] px-5 text-[16px] font-semibold text-white hover:bg-[#E67900]"><Plus size={18} strokeWidth={2.5} />New ride request</button>;

  return <div className="w-full rounded-[24px] bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between"><h2 className="text-[20px] font-semibold">New ride request</h2>
      <button type="button" onClick={() => { setOpen(false); setLink(""); }} aria-label="Close" className="grid size-9 place-items-center rounded-full bg-slate-100"><X size={18} /></button></div>
    {link ? <div className="mt-4 grid gap-3">
      <p className="text-[15px] text-slate-600">Fill in the ride details yourself, or send this link to your client. Our team will review availability and confirm the booking and any extras. A request is not a confirmed booking.</p>
      <div className="flex flex-wrap gap-2">
        <a href={link} className="inline-flex h-11 items-center rounded-full bg-[#FF8A05] px-5 font-semibold text-white">Fill in now</a>
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }} className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 px-5 font-medium">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy link for client"}</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(`Please fill in your ride details here: ${link}`)}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center rounded-full bg-[#25D366] px-5 font-semibold text-white">WhatsApp</a>
      </div>
    </div> : <div className="mt-4 grid gap-3">
      <div role="tablist" aria-label="Service" className="inline-flex w-fit rounded-xl bg-[#E8EAEE] p-1">
        {([["transfer", "Transfer"], ["hourly", "By the hour"], ["tour", "Tour"]] as const).map(([id, text]) => <button key={id} type="button" role="tab" aria-selected={service === id} onClick={() => {setService(id);setRateId("");}} className={`h-9 rounded-lg px-4 text-[14px] ${service === id ? "bg-white font-medium shadow-sm" : "text-slate-600"}`}>{text}</button>)}
      </div>
      <label className="block text-sm font-medium text-slate-600">Agreed rate (optional)<select value={rateId} onChange={e=>{setRateId(e.target.value);const rate=rates.find(r=>r.id===e.target.value);if(rate)setService(rate.service_type);}} className="mt-1 h-11 w-full rounded-xl border px-3"><option value="">Custom itinerary — request operations quote</option>{rates.map(r=><option key={r.id} value={r.id}>{r.label} · THB {(r.price_minor/100).toFixed(2)}</option>)}</select></label>
      {rateId&&<p className="text-sm text-slate-600">The selected rate locks the route and vehicle. Choose a pickup date within its validity period. Availability and extras need operations confirmation.</p>}
      <label className="block text-[13px] font-medium text-slate-600">Your reference or note (optional)<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="e.g. Group SMITH-1012" className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-[15px] outline-none focus:border-[#FF8A05]" /></label>
      <div className="flex items-center gap-3"><button type="button" onClick={() => void create()} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-full bg-[#FF8A05] px-5 font-semibold text-white disabled:opacity-60">{busy && <LoaderCircle size={16} className="animate-spin" />}Create request</button>{error && <span className="text-[14px] text-red-600">{error}</span>}</div>
    </div>}
  </div>;
}
