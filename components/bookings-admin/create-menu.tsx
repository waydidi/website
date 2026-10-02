"use client";

import { ArrowLeft, CalendarPlus, Car, Check, ChevronDown, Clock, Copy, FileText, LoaderCircle, Map as MapIcon, Plus } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { NewBookingButton } from "@/components/bookings-admin/new-booking";
import type { FormService } from "@/lib/booking-form";

// One "Create" button: a centred popup to choose between a customer form link and a booking.
export function CreateMenu({ service, waiting = 0 }: { service: FormService; waiting?: number }) {
  const [open, setOpen] = useState(false);
  const [bookingSignal, setBookingSignal] = useState(0);
  // Step 2 of "Create form" / "Create booking": pick the service in the same centred popup.
  const [step, setStep] = useState<"choose" | "form" | "booking">("choose");
  const [kind, setKind] = useState<FormService>("transfer");
  // "Create form": choosing a service makes the link at once, shows it below the choice and copies it.
  const [made, setMade] = useState<{ kind: FormService; url?: string; copied?: boolean; busy?: boolean; error?: string } | null>(null);

  function makeLink(id: FormService) {
    if (made?.kind === id && made.url) { setMade(null); return; }
    setMade({ kind: id, busy: true });
    const urlPromise = fetch("/api/admin/forms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceType: id }) })
      .then(async (res) => {
        const out = await res.json().catch(() => ({})) as { token?: string; error?: string };
        if (!res.ok || !out.token) throw new Error(out.error ?? "The link could not be created.");
        return `${window.location.origin}/f/${out.token}`;
      });
    // Start the copy inside the tap (Safari only allows that) and let it wait for the new link.
    const copy = typeof ClipboardItem !== "undefined" && navigator.clipboard?.write
      ? navigator.clipboard.write([new ClipboardItem({ "text/plain": urlPromise.then((u) => new Blob([u], { type: "text/plain" })) })])
      : urlPromise.then((u) => navigator.clipboard?.writeText(u));
    urlPromise.then((url) => {
      setMade({ kind: id, url });
      copy.then(() => setMade({ kind: id, url, copied: true })).catch(() => undefined);
    }).catch((e: unknown) => setMade({ kind: id, error: e instanceof Error ? e.message : "The link could not be created." }));
  }
  const choice = "flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-7 text-[15px] font-bold text-slate-900 transition hover:border-[#FF8A05] hover:bg-orange-50/50";
  const icon = "grid size-14 place-items-center rounded-2xl bg-[#FFF0DF] text-[#D96F00]";

  return <>
    <button type="button" onClick={() => { setStep("choose"); setOpen(true); }} className="relative inline-flex h-10 items-center gap-1.5 rounded-full bg-[#FF8A05] px-4 text-[15px] font-semibold text-white hover:bg-[#E67900]">
      <Plus size={17} strokeWidth={2.5} />Create
      {waiting > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-[#D32F2F] px-1 text-[11px] font-bold text-white">{waiting}</span>}
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="rounded-[28px] border-0 bg-white p-6 text-slate-900 sm:max-w-md">
        <DialogTitle className="flex items-center gap-2 text-[22px] font-semibold">{step !== "choose" && <button type="button" onClick={() => setStep("choose")} aria-label="Back" className="rounded-full p-1 hover:bg-slate-100"><ArrowLeft size={20} /></button>}{step === "form" ? "Create form" : step === "booking" ? "Create booking" : "Create"}</DialogTitle>
        <DialogDescription className="sr-only">Choose a form link for a customer or a booking.</DialogDescription>
        {step !== "choose" ? <div className="mt-2 grid gap-3">
          {([["transfer", "Transfer", Car], ["hourly", "By the hour", Clock], ["tour", "Tour", MapIcon]] as const).map(([id, label, Icon]) => {
            const mine = step === "form" && made?.kind === id ? made : null;
            return <div key={id} className={`overflow-hidden rounded-2xl border bg-white transition ${mine ? "border-[#FF8A05]" : "border-slate-200 hover:border-[#FF8A05]"}`}>
              <button type="button" onClick={() => { if (step === "form") { makeLink(id); return; } setKind(id); setOpen(false); setBookingSignal((n) => n + 1); }} aria-expanded={step === "form" ? Boolean(mine) : undefined} className="flex w-full items-center gap-4 p-4 text-left text-[16px] font-bold text-slate-900 hover:bg-orange-50/50"><span className="grid size-12 place-items-center rounded-2xl bg-[#FFF0DF] text-[#D96F00]"><Icon size={24} /></span>{label}{step === "form" && <ChevronDown size={20} className={`ml-auto text-slate-400 transition ${mine ? "rotate-180" : ""}`} />}</button>
              {mine && <div className="border-t border-slate-100 bg-orange-50/40 px-4 pb-4 pt-3 animate-in fade-in slide-in-from-top-1">
                {mine.busy ? <p className="flex items-center gap-2 text-[14px] text-slate-600"><LoaderCircle size={16} className="animate-spin" />Creating link…</p>
                  : mine.error ? <p role="alert" className="text-[14px] font-semibold text-red-600">{mine.error}</p>
                  : mine.url && <>
                    <div className="flex items-center gap-2">
                      <a href={mine.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-[13px] text-[#C96100] underline-offset-2 hover:underline">{mine.url}</a>
                      <button type="button" onClick={() => { void navigator.clipboard?.writeText(mine.url!).then(() => setMade({ ...mine, copied: true })); }} aria-label="Copy link" className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white hover:border-[#FF8A05]">{mine.copied ? <Check size={17} className="text-emerald-600" /> : <Copy size={17} />}</button>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2 text-[13px]">
                      <span className={`font-semibold ${mine.copied ? "text-emerald-700" : "text-slate-500"}`}>{mine.copied ? "Link copied" : "Tap the copy button to copy"}</span>
                      <a href={`https://wa.me/?text=${encodeURIComponent(`Please fill in your ride details here: ${mine.url}`)}`} target="_blank" rel="noreferrer" className="ml-auto rounded-full bg-[#25D366] px-3 py-1.5 font-semibold text-white">WhatsApp</a>
                    </div>
                  </>}
              </div>}
            </div>;
          })}
        </div> : <div className="mt-2 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => { setMade(null); setStep("form"); }} className={`relative ${choice}`}>
            <span className={icon}><FileText size={26} /></span>Create form
            {waiting > 0 && <span className="absolute right-3 top-3 rounded-full bg-[#D32F2F] px-2 py-0.5 text-[11px] font-bold text-white">{waiting} new</span>}
          </button>
          <button type="button" onClick={() => setStep("booking")} className={choice}>
            <span className={icon}><CalendarPlus size={26} /></span>Create booking
          </button>
        </div>}
      </DialogContent>
    </Dialog>
    <NewBookingButton service={service} openSignal={bookingSignal} openKind={kind} />
  </>;
}
