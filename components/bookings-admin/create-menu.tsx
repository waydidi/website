"use client";

import { ArrowLeft, Share2, CalendarPlus, Car, Check, ChevronDown, Clock, Copy, FileText, LoaderCircle, Map as MapIcon, Plus } from "lucide-react";
import { useEffect, useState } from "react";
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

  // Links made earlier, shown under each service so staff can find, copy or check them again.
  const [saved, setSaved] = useState<SavedLink[] | null>(null);
  const loadSaved = () => fetch("/api/admin/forms", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { forms: [] }))
    .then((out: { forms?: SavedLink[] }) => setSaved(out.forms ?? [])).catch(() => setSaved([]));
  useEffect(() => { if (open && step === "form") void loadSaved(); }, [open, step]);

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
      void loadSaved();
      copy.then(() => setMade({ kind: id, url, copied: true })).catch(() => undefined);
    }).catch((e: unknown) => setMade({ kind: id, error: e instanceof Error ? e.message : "The link could not be created." }));
  }
  const choice = "flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-7 text-[15px] font-bold text-slate-900 transition hover:border-brand hover:bg-orange-50/50";
  const icon = "grid size-14 place-items-center rounded-2xl bg-brand-tint text-brand-text";

  return <>
    <button type="button" onClick={() => { setStep("choose"); setOpen(true); }} className="relative inline-flex h-10 items-center gap-1.5 rounded-full bg-brand px-4 text-[15px] font-semibold text-white hover:bg-brand-strong">
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
            return <div key={id} className={`overflow-hidden rounded-2xl border bg-white transition ${mine ? "border-brand" : "border-slate-200 hover:border-brand"}`}>
              <button type="button" onClick={() => { if (step === "form") { makeLink(id); return; } setKind(id); setOpen(false); setBookingSignal((n) => n + 1); }} aria-expanded={step === "form" ? Boolean(mine) : undefined} className="flex w-full items-center gap-4 p-4 text-left text-[16px] font-bold text-slate-900 hover:bg-orange-50/50"><span className="grid size-12 place-items-center rounded-2xl bg-brand-tint text-brand-text"><Icon size={24} /></span>{label}{step === "form" && <ChevronDown size={20} className={`ml-auto text-slate-400 transition ${mine ? "rotate-180" : ""}`} />}</button>
              {mine && <div className="border-t border-slate-100 bg-orange-50/40 px-4 pb-4 pt-3 animate-in fade-in slide-in-from-top-1">
                {mine.busy ? <p className="flex items-center gap-2 text-[14px] text-slate-600"><LoaderCircle size={16} className="animate-spin" />Creating link…</p>
                  : mine.error ? <p role="alert" className="text-[14px] font-semibold text-red-600">{mine.error}</p>
                  : mine.url && <>
                    <div className="flex items-center gap-2">
                      <a href={mine.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate rounded-xl border border-slate-200 bg-white px-3 py-2.5 font-mono text-[13px] text-brand-darker underline-offset-2 hover:underline">{mine.url}</a>
                      <button type="button" onClick={() => { void navigator.clipboard?.writeText(mine.url!).then(() => setMade({ ...mine, copied: true })); }} aria-label="Copy link" className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white hover:border-brand">{mine.copied ? <Check size={17} className="text-emerald-600" /> : <Copy size={17} />}</button>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2 text-[13px]">
                      <span className={`font-semibold ${mine.copied ? "text-emerald-700" : "text-slate-500"}`}>{mine.copied ? "Link copied" : "Tap the copy button to copy"}</span>
                      <ShareLink url={mine.url} />
                    </div>
                  </>}
                <SavedLinks links={(saved ?? []).filter((f) => f.serviceType === id)} loading={!saved} current={mine.url} />
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

// One "Share" button: the phone's share sheet (WhatsApp, LINE, KakaoTalk, Messages, Messenger…),
// or a short list of apps where the browser has no share sheet (most desktops; Messenger and
// KakaoTalk need the phone share sheet).
function ShareLink({ url }: { url: string }) {
  const [menu, setMenu] = useState(false);
  const text = "Please fill in your ride details here:";
  const msg = encodeURIComponent(`${text} ${url}`);
  const apps: [string, string][] = [
    ["WhatsApp", `https://wa.me/?text=${msg}`],
    ["LINE", `https://line.me/R/share?text=${msg}`],
    ["Telegram", `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`],
    ["Messages (SMS)", `sms:?&body=${msg}`],
    ["Email", `mailto:?subject=${encodeURIComponent("Your Waydidi ride details")}&body=${msg}`],
  ];
  return <span className="relative ml-auto">
    <button type="button" onClick={() => {
      if (typeof navigator.share === "function") { void navigator.share({ title: "Waydidi ride details", text, url }).catch(() => undefined); return; }
      setMenu((m) => !m);
    }} className="inline-flex items-center gap-1.5 rounded-full bg-brand px-3 py-1.5 font-semibold text-white hover:bg-brand-strong"><Share2 size={14} />Share</button>
    {menu && <span className="absolute right-0 top-9 z-10 grid w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
      {apps.map(([label, href]) => <a key={label} href={href} target="_blank" rel="noreferrer" onClick={() => setMenu(false)} className="px-3 py-2 text-[13px] font-medium text-slate-800 hover:bg-orange-50">{label}</a>)}
    </span>}
  </span>;
}

type SavedLink = { token: string; serviceType: FormService; status: "waiting" | "submitted" | "booked"; note: string | null; createdAt: string; expiresAt: string; bookingReference: string | null };
const STATUS: Record<SavedLink["status"], [string, string]> = {
  waiting: ["Waiting", "bg-amber-50 text-amber-800"], submitted: ["Answered", "bg-blue-50 text-blue-800"], booked: ["Booked", "bg-emerald-50 text-emerald-800"],
};

// Earlier links for this service, newest first.
function SavedLinks({ links, loading, current }: { links: SavedLink[]; loading: boolean; current?: string }) {
  const [copied, setCopied] = useState("");
  const [all, setAll] = useState(false);
  const rest = links.filter((l) => !current?.endsWith(`/f/${l.token}`));
  if (loading) return <p className="mt-4 text-[13px] text-slate-500">Loading saved links…</p>;
  if (!rest.length) return null;
  const shown = all ? rest : rest.slice(0, 5);
  const now = new Date().toISOString();
  return <div className="mt-4 border-t border-orange-100 pt-3">
    <p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Saved links</p>
    <ul className="mt-2 grid gap-1.5">
      {shown.map((l) => {
        const url = `${window.location.origin}/f/${l.token}`;
        const expired = l.status === "waiting" && l.expiresAt < now;
        const [label, tone] = expired ? ["Expired", "bg-slate-100 text-slate-500"] : STATUS[l.status];
        return <li key={l.token} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-[13px] ring-1 ring-slate-200">
          <div className="min-w-0 flex-1">
            <a href={url} target="_blank" rel="noreferrer" className="block truncate font-mono text-brand-darker hover:underline">/f/{l.token}</a>
            <span className="text-[12px] text-slate-500">{new Date(l.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}{l.bookingReference ? ` · ${l.bookingReference}` : ""}{l.note ? ` · ${l.note}` : ""}</span>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(url).then(() => { setCopied(l.token); setTimeout(() => setCopied(""), 1500); }); }} aria-label="Copy link" className="grid size-8 shrink-0 place-items-center rounded-lg border border-slate-200 hover:border-brand">{copied === l.token ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}</button>
        </li>;
      })}
    </ul>
    {rest.length > 5 && <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-[13px] font-semibold text-brand-darker">{all ? "Show fewer" : `Show all ${rest.length}`}</button>}
  </div>;
}
