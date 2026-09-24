"use client";

import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronRight, X } from "lucide-react";

type Toggleable = "functional" | "analytics" | "advertisement";
type Choices = Record<Toggleable, boolean>;

export const CONSENT_COOKIE = "waydidi_consent";
const NONE: Choices = { functional: false, analytics: false, advertisement: false };
const ALL: Choices = { functional: true, analytics: true, advertisement: true };

const CATEGORIES: { id: string; title: string; text: string; toggle?: Toggleable; always?: boolean }[] = [
  { id: "necessary", title: "Necessary", always: true, text: "Necessary cookies are required to enable the basic features of this site, such as providing secure log-in or adjusting your consent preferences. These cookies do not store any personally identifiable data." },
  { id: "functional", title: "Functional", toggle: "functional", text: "Functional cookies help perform certain functionalities like sharing the content of the website on social media platforms, collecting feedback, and other third-party features." },
  { id: "analytics", title: "Analytics", toggle: "analytics", text: "Analytical cookies are used to understand how visitors interact with the website. These cookies help provide information on metrics such as the number of visitors, bounce rate, traffic source, etc." },
  { id: "performance", title: "Performance", text: "Performance cookies are used to understand and analyze the key performance indexes of the website which helps in delivering a better user experience for the visitors." },
  { id: "advertisement", title: "Advertisement", toggle: "advertisement", text: "Advertisement cookies are used to provide visitors with customized advertisements based on the pages you visited previously and to analyze the effectiveness of the ad campaigns." },
  { id: "uncategorized", title: "Uncategorized", text: "Other uncategorized cookies are those that are being analyzed and have not been classified into a category as yet." },
];

export function readConsent(): Choices {
  if (typeof document === "undefined") return NONE;
  const raw = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`))?.split("=")[1] ?? "";
  const set = new Set(decodeURIComponent(raw).split(","));
  return { functional: set.has("functional"), analytics: set.has("analytics"), advertisement: set.has("advertisement") };
}

function saveConsent(choices: Choices) {
  const value = (Object.keys(choices) as Toggleable[]).filter((k) => choices[k]).join(",") || "necessary";
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent("waydidi:consent", { detail: choices }));
}

function ChoicesIcon() {
  return <svg width="30" height="14" viewBox="0 0 30 14" aria-hidden="true" className="shrink-0">
    <rect width="30" height="14" rx="7" fill="#fff" />
    <path d="M7 0h9l-5 14H7A7 7 0 0 1 7 0Z" fill="#0066FF" />
    <path d="M4.5 7.2 6.4 9l3.3-4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m19.2 4.4 5 5.2m0-5.2-5 5.2" stroke="#0066FF" strokeWidth="1.6" strokeLinecap="round" />
  </svg>;
}

export function PrivacyChoices() {
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [choices, setChoices] = useState<Choices>(NONE);
  useEffect(() => { if (open) setChoices(readConsent()); }, [open]);

  const finish = (value: Choices) => { saveConsent(value); setOpen(false); };

  return <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
    <DialogPrimitive.Trigger asChild>
      <button type="button" className="inline-flex items-center gap-2 text-left text-base underline decoration-1 underline-offset-4 hover:decoration-2">
        <ChoicesIcon />Your Privacy Choices
      </button>
    </DialogPrimitive.Trigger>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-[81] flex max-h-[92dvh] flex-col rounded-t-xl bg-white text-[#212121] shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[85dvh] sm:w-[640px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <DialogPrimitive.Title className="text-lg font-bold">Customize Consent Preferences</DialogPrimitive.Title>
          <DialogPrimitive.Close className="grid size-9 place-items-center rounded-full text-slate-500 hover:bg-slate-100" aria-label="Close"><X size={22} /></DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 text-[15px] leading-7">
          <DialogPrimitive.Description asChild>
            <div>
              <p>We use cookies to help you navigate efficiently and perform certain functions. You will find detailed information about all cookies under each consent category below.</p>
              {more && <>
                <p>The cookies that are categorized as &quot;Necessary&quot; are stored on your browser as they are essential for enabling the basic functionalities of the site.</p>
                <p>We also use third-party cookies that help us analyze how you use this website, store your preferences, and provide the content and advertisements that are relevant to you. These cookies will only be stored in your browser with your prior consent.</p>
                <p>You can choose to enable or disable some or all of these cookies but disabling some of them may affect your browsing experience.</p>
              </>}
              <button type="button" onClick={() => setMore(!more)} className="text-[#1863DC] hover:underline">{more ? "Show less" : "Show more"}</button>
            </div>
          </DialogPrimitive.Description>
          <ul className="mt-3">
            {CATEGORIES.map((c) => <li key={c.id} className="border-t border-slate-200 py-4">
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setExpanded(expanded === c.id ? null : c.id)} aria-expanded={expanded === c.id} className="flex flex-1 items-center gap-3 text-left text-lg font-bold">
                  <ChevronRight size={16} className={`text-slate-300 transition ${expanded === c.id ? "rotate-90" : ""}`} aria-hidden="true" />{c.title}
                </button>
                {c.always && <span className="font-semibold text-[#008000]">Always Active</span>}
                {c.toggle && <button type="button" role="switch" aria-checked={choices[c.toggle]} aria-label={c.title} onClick={() => setChoices({ ...choices, [c.toggle!]: !choices[c.toggle!] })} className={`relative h-6 w-11 shrink-0 rounded-full transition ${choices[c.toggle] ? "bg-[#FF8A05]" : "bg-[#D0D5D2]"}`}>
                  <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${choices[c.toggle] ? "left-[22px]" : "left-0.5"}`} />
                </button>}
              </div>
              <p className="mt-2 pl-7 text-[15px] leading-7">{c.text}</p>
              {expanded === c.id && <p className="mt-2 pl-7 text-sm text-slate-500">{c.id === "necessary" ? "Cookies: waydidi_consent, waydidi_locale, and sign-in session cookies." : "No cookies to display."}</p>}
            </li>)}
          </ul>
        </div>
        <div className="grid gap-3 px-6 pb-6 pt-3">
          <button type="button" onClick={() => finish(ALL)} className="h-12 rounded bg-[#212121] font-medium text-white hover:bg-black">Accept All</button>
          <button type="button" onClick={() => finish(choices)} className="h-12 rounded border-2 border-[#212121] font-medium hover:bg-slate-50">Save My Preferences</button>
          <button type="button" onClick={() => finish(NONE)} className="h-12 rounded border-2 border-[#212121] font-medium hover:bg-slate-50">Reject All</button>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
