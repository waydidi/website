"use client";

import { ChevronDown, Luggage, Minus, Plus, Users, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/components/i18n-provider";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// Passengers & bags as in the homepage search box: a row with the people and bag icons that opens the
// same "Passengers" sheet from the bottom (adults, children, checked bags). Only the totals are kept.
export function PassengerField({ passengers, bags, onChange, maxPassengers = 30, maxBags = 40, className = "" }: {
  passengers: number; bags: number; onChange: (passengers: number, bags: number) => void;
  maxPassengers?: number; maxBags?: number; className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [adults, setAdults] = useState(passengers);
  const [children, setChildren] = useState(0);
  const show = () => { setAdults(Math.max(1, passengers - children)); setOpen(true); };
  const setPeople = (a: number, c: number) => { setAdults(a); setChildren(c); onChange(a + c, bags); };
  return <>
    <button type="button" onClick={show} aria-label={t("hero.travellersLabel", { passengers, bags })}
      className={`flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-[15px] text-slate-950 ${className}`}>
      <span className="flex items-center gap-3.5">
        <span className="flex items-center gap-2"><Users size={20} aria-hidden="true" />{passengers}</span>
        <span className="flex items-center gap-2"><Luggage size={20} aria-hidden="true" />{bags}</span>
      </span>
      <ChevronDown size={19} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden="true" />
    </button>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="bottom" showCloseButton={false} className="max-h-[92dvh] overflow-y-auto rounded-t-[32px] border-0 bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 text-ink data-[state=open]:duration-500 motion-reduce:duration-0 sm:px-8 lg:left-1/2 lg:max-w-3xl lg:-translate-x-1/2">
        <div className="mx-auto h-1.5 w-16 rounded-full bg-slate-300" aria-hidden="true" />
        <SheetHeader className="flex-row items-center justify-between px-0 pb-2 pt-5 text-left">
          <SheetTitle className="text-[28px] font-semibold tracking-[-.03em] sm:text-[34px]">{t("pax.title")}</SheetTitle>
          <button type="button" onClick={() => setOpen(false)} aria-label={t("pax.close")} className="grid size-12 place-items-center rounded-full bg-slate-100 text-brand-deep transition hover:bg-orange-50"><X size={25} /></button>
        </SheetHeader>
        <div className="grid gap-6 py-4">
          <Counter label={t("pax.adults")} description={t("pax.adultsHint")} value={adults} min={1} max={maxPassengers - children} onChange={(v) => setPeople(v, children)} />
          <Counter label={t("pax.children")} description={t("pax.childrenHint")} value={children} min={0} max={maxPassengers - adults} onChange={(v) => setPeople(adults, v)} />
          <Counter label="Checked bags" description="Choose your luggage separately from passenger count. Tell us about oversized items in the booking notes." value={bags} min={0} max={maxBags} onChange={(v) => onChange(passengers, v)} />
        </div>
        <div className="mt-5 rounded-[24px] bg-slate-100 p-5 text-slate-600">
          <p className="mb-4 font-semibold">Your luggage selection</p>
          <span className="flex items-center gap-3"><Luggage size={24} aria-hidden="true" /><strong>{t("pax.checkedBags", { count: bags })}</strong></span>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="mt-5 min-h-14 w-full rounded-full bg-brand px-6 text-lg font-bold text-white transition hover:bg-brand-hover">{t("common.done")}</button>
      </SheetContent>
    </Sheet>
  </>;
}

function Counter({ label, description, value, min, max, onChange }: { label: string; description: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const { t } = useI18n();
  return <div className="flex items-center justify-between gap-5">
    <span className="min-w-0"><strong className="block text-lg font-semibold text-slate-950">{label}</strong><span className="mt-0.5 block text-base text-slate-500">{description}</span></span>
    <span className="flex min-h-14 shrink-0 items-center rounded-full border border-slate-300 px-2">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={t("pax.decrease", { label })} className="grid size-11 place-items-center rounded-full text-slate-700 hover:bg-orange-50 hover:text-brand-deep disabled:cursor-not-allowed disabled:text-slate-300"><Minus size={19} /></button>
      <strong className="w-10 text-center text-xl">{value}</strong>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={t("pax.increase", { label })} className="grid size-11 place-items-center rounded-full text-slate-700 hover:bg-orange-50 hover:text-brand-deep disabled:cursor-not-allowed disabled:text-slate-300"><Plus size={19} /></button>
    </span>
  </div>;
}
