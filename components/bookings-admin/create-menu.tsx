"use client";

import { ArrowLeft, CalendarPlus, Car, Clock, FileText, Map as MapIcon, Plus } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FormRequestsButton } from "@/components/bookings-admin/form-requests";
import { NewBookingButton } from "@/components/bookings-admin/new-booking";
import type { FormService } from "@/lib/booking-form";

// One "Create" button: a centred popup to choose between a customer form link and a booking.
export function CreateMenu({ service, openForm }: { service: FormService; openForm?: string }) {
  const [open, setOpen] = useState(false);
  const [formSignal, setFormSignal] = useState(0);
  const [bookingSignal, setBookingSignal] = useState(0);
  const [waiting, setWaiting] = useState(0);
  // Step 2 of "Create form": pick the service in the same centred popup.
  const [step, setStep] = useState<"choose" | "service">("choose");
  const [kind, setKind] = useState<FormService>("transfer");
  const choice = "flex flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-7 text-[15px] font-bold text-slate-900 transition hover:border-[#FF8A05] hover:bg-orange-50/50";
  const icon = "grid size-14 place-items-center rounded-2xl bg-[#FFF0DF] text-[#D96F00]";

  return <>
    <button type="button" onClick={() => { setStep("choose"); setOpen(true); }} className="relative inline-flex h-10 items-center gap-1.5 rounded-full bg-[#FF8A05] px-4 text-[15px] font-semibold text-white hover:bg-[#E67900]">
      <Plus size={17} strokeWidth={2.5} />Create
      {waiting > 0 && <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-[#D32F2F] px-1 text-[11px] font-bold text-white">{waiting}</span>}
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="rounded-[28px] border-0 bg-white p-6 text-slate-900 sm:max-w-md">
        <DialogTitle className="flex items-center gap-2 text-[22px] font-semibold">{step === "service" && <button type="button" onClick={() => setStep("choose")} aria-label="Back" className="rounded-full p-1 hover:bg-slate-100"><ArrowLeft size={20} /></button>}{step === "service" ? "Create form" : "Create"}</DialogTitle>
        <DialogDescription className="sr-only">Choose a form link for a customer or a booking.</DialogDescription>
        {step === "service" ? <div className="mt-2 grid gap-3">
          {([["transfer", "Transfer", Car], ["hourly", "By the hour", Clock], ["tour", "Tour", MapIcon]] as const).map(([id, label, Icon]) => <button key={id} type="button" onClick={() => { setKind(id); setOpen(false); setFormSignal((n) => n + 1); }} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left text-[16px] font-bold text-slate-900 transition hover:border-[#FF8A05] hover:bg-orange-50/50"><span className="grid size-12 place-items-center rounded-2xl bg-[#FFF0DF] text-[#D96F00]"><Icon size={24} /></span>{label}</button>)}
        </div> : <div className="mt-2 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setStep("service")} className={`relative ${choice}`}>
            <span className={icon}><FileText size={26} /></span>Create form
            {waiting > 0 && <span className="absolute right-3 top-3 rounded-full bg-[#D32F2F] px-2 py-0.5 text-[11px] font-bold text-white">{waiting} new</span>}
          </button>
          <button type="button" onClick={() => { setOpen(false); setBookingSignal((n) => n + 1); }} className={choice}>
            <span className={icon}><CalendarPlus size={26} /></span>Create booking
          </button>
        </div>}
      </DialogContent>
    </Dialog>
    <FormRequestsButton service={service} openForm={openForm} openSignal={formSignal} openKind={kind} onWaiting={setWaiting} />
    <NewBookingButton service={service} openSignal={bookingSignal} />
  </>;
}
