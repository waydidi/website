"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, Share } from "lucide-react";
import { useCurrency } from "@/components/use-currency";
import { CURRENCIES } from "@/components/locale-picker";
import { CURRENCY_COOKIE, CURRENCY_EVENT } from "@/lib/currency";
import { SOCIAL_LINKS, type SocialNetwork } from "@/lib/social-links";
import { fill, type TripLang, type TripWords } from "@/lib/trip-i18n";

const LANGS: [TripLang, string][] = [["en", "English"], ["th", "ไทย"], ["zh", "中文"]];
const box = "relative flex h-[54px] min-w-0 items-center rounded-2xl border-2 border-slate-200 bg-white";
const select = "h-full w-full min-w-0 cursor-pointer appearance-none truncate rounded-2xl bg-transparent pl-6 pr-12 text-[17px] text-plum outline-none focus-visible:ring-2 focus-visible:ring-brand";

/**
 * The end of the itinerary, like Klook's: language and currency boxes, Help, social icons, a round Share button
 * and the copyright line.
 */
export function PageTools({ lang, words: w }: { lang: TripLang; words: TripWords }) {
  const router = useRouter();
  const { currency } = useCurrency();
  const [copied, setCopied] = useState(false);
  const chooseCurrency = (code: string) => {
    document.cookie = `${CURRENCY_COOKIE}=${code}; Path=/; Max-Age=31536000; SameSite=Lax`;
    window.dispatchEvent(new Event(CURRENCY_EVENT));
  };
  const share = async () => {
    const url = window.location.href.split("#")[0];
    if (navigator.share) { await navigator.share({ title: document.title, url }).catch(() => undefined); return; }
    await navigator.clipboard?.writeText(url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }).catch(() => undefined);
  };
  const socials = SOCIAL_LINKS.filter((s) => s.href);
  return <section aria-label={`${w.languageLabel} · ${w.currencyLabel}`} className="-mx-4 bg-white px-4 pb-8 pt-8 sm:px-7">
    <div className="grid grid-cols-2 gap-4">
      <label className={box}>
        <span className="sr-only">{w.languageLabel}</span>
        <select value={lang} onChange={(e) => router.replace(`?lang=${e.target.value}`, { scroll: false })} className={select}>
          {LANGS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
        </select>
        <ChevronDown size={24} aria-hidden className="pointer-events-none absolute right-5 text-plum" />
      </label>
      <label className={box}>
        <span className="sr-only">{w.currencyLabel}</span>
        <select value={currency} onChange={(e) => chooseCurrency(e.target.value)} className={select}>
          {CURRENCIES.map(([code, name]) => <option key={code} value={code}>{code} | {name}</option>)}
        </select>
        <ChevronDown size={24} aria-hidden className="pointer-events-none absolute right-5 text-plum" />
      </label>
    </div>
    <Link href="/help" className="mt-5 flex h-[54px] items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-[17px] font-bold text-plum hover:bg-canvas">{w.helpLabel}</Link>
    <div className="mt-6 flex items-center justify-between gap-4">
      <div className="min-w-0">
        {socials.length > 0 && <ul className="flex items-center gap-7">
          {socials.map((s) => <li key={s.network}><a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="grid size-8 place-items-center text-plum hover:opacity-70"><SocialIcon network={s.network} /></a></li>)}
        </ul>}
        <p className={`text-[15px] text-slate-500 ${socials.length ? "mt-5" : ""}`}>{fill(w.rightsReserved, { year: new Date().getFullYear() })}</p>
      </div>
      <button type="button" onClick={() => void share()} aria-label={w.shareLabel} className="relative grid size-[75px] shrink-0 place-items-center rounded-full bg-white text-plum shadow-[0_6px_24px_rgba(0,0,0,.12)] hover:bg-canvas">
        <Share size={28} />
        {copied && <span role="status" className="absolute -top-9 right-0 whitespace-nowrap rounded-lg bg-plum px-2.5 py-1 text-[13px] font-semibold text-white">{w.linkCopied}</span>}
      </button>
    </div>
  </section>;
}

/** Plain one-colour brand marks drawn for this row (24px grid). */
function SocialIcon({ network }: { network: SocialNetwork }) {
  const props = { width: 28, height: 28, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  if (network === "facebook") return <svg {...props} fill="currentColor"><path d="M13.5 22v-8.2h2.8l.4-3.3h-3.2V8.4c0-.9.3-1.6 1.6-1.6h1.7V3.9a23 23 0 0 0-2.5-.1c-2.5 0-4.2 1.5-4.2 4.3v2.4H7.3v3.3h2.8V22z" /></svg>;
  if (network === "youtube") return <svg {...props} fill="currentColor"><path d="M22.5 7.2a2.8 2.8 0 0 0-2-2C18.8 4.8 12 4.8 12 4.8s-6.8 0-8.5.4a2.8 2.8 0 0 0-2 2A29 29 0 0 0 1 12a29 29 0 0 0 .5 4.8 2.8 2.8 0 0 0 2 2c1.7.4 8.5.4 8.5.4s6.8 0 8.5-.4a2.8 2.8 0 0 0 2-2A29 29 0 0 0 23 12a29 29 0 0 0-.5-4.8zM9.8 15.1V8.9l5.6 3.1z" /></svg>;
  if (network === "instagram") return <svg {...props} fill="none" stroke="currentColor" strokeWidth="2.2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r=".6" fill="currentColor" /></svg>;
  if (network === "x") return <svg {...props} fill="currentColor"><path d="M17.8 2.5h3.3l-7.2 8.2 8.5 10.8h-6.6l-5.2-6.7-5.9 6.7H1.4l7.7-8.8L1 2.5h6.8l4.7 6.1zm-1.2 17.1h1.8L7.1 4.3H5.1z" /></svg>;
  return <svg {...props} fill="currentColor"><path d="M16.6 2h-3.4v13.4a2.9 2.9 0 1 1-2-2.8V9.2a6.3 6.3 0 1 0 5.4 6.2V8.6a7.9 7.9 0 0 0 4.4 1.4V6.6A4.4 4.4 0 0 1 16.6 2z" /></svg>;
}
