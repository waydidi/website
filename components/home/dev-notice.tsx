"use client";

import { useEffect, useState } from "react";
import { MessageCircle, X } from "lucide-react";
import { Modal, ModalClose, ModalTitle } from "@/components/ui/modal";

// Homepage-only popup while online booking is not ready: points visitors to WhatsApp.
// Opens after hydration, so the server-rendered (and cached) homepage markup is unchanged.
// Closing hides it for this page view only.
export function DevNotice({ title, body, whatsapp, whatsappUrl, contactLabel, closeLabel }: {
  title: string;
  body: string;
  whatsapp: string;
  whatsappUrl: string;
  contactLabel: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- open only once the page has hydrated
  useEffect(() => { setOpen(true); }, []);
  if (!open) return null;
  // A centred popup on every screen size (not a bottom sheet on phones).
  return <Modal open onClose={() => setOpen(false)} aria-describedby="dev-notice-body"
    className="max-w-md rounded-card p-6 text-left text-plum shadow-2xl">
    <ModalClose aria-label={closeLabel} className="absolute right-3 top-3 grid size-tap place-items-center rounded-full text-slate-500 hover:bg-slate-100"><X size={20} /></ModalClose>
    <ModalTitle className="pr-10 text-[22px] font-black tracking-[-.035em]">{title}</ModalTitle>
    <p id="dev-notice-body" className="mt-2 text-[15px] leading-relaxed text-slate-600">
      {body} <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="whitespace-nowrap font-bold text-brand-deep underline">{whatsapp}</a>
    </p>
    <div className="mt-6 grid gap-2 sm:grid-cols-2">
      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
        className="flex min-h-tap items-center justify-center gap-2 rounded-full bg-brand px-5 font-bold text-ink hover:bg-brand-hover">
        <MessageCircle size={18} aria-hidden="true" />{contactLabel}
      </a>
      <ModalClose className="min-h-tap rounded-full border border-slate-300 px-5 font-bold text-plum hover:bg-slate-50">{closeLabel}</ModalClose>
    </div>
  </Modal>;
}
