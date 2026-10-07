"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { KIT_ROUTES, kitCaption, type KitLang } from "@/lib/partner-kit";

const LANGS: [KitLang, string][] = [["en", "English"], ["th", "ไทย"], ["zh", "中文"]];

/** Ready-to-post content: a photo and a caption (with the partner's code and link) for popular routes. */
export function ContentKit({ slug, code, discount, prices }: { slug: string; code: string; discount: number; prices: Record<string, number> }) {
  const [lang, setLang] = useState<KitLang>("en");
  const [copied, setCopied] = useState<string | null>(null);
  return <div>
    <div role="tablist" className="mb-4 inline-flex rounded-full bg-slate-100 p-1">{LANGS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={lang === k} onClick={() => setLang(k)} className={`rounded-full px-4 py-1.5 text-[13.5px] font-semibold ${lang === k ? "bg-white text-brand-darker shadow-sm" : "text-slate-600"}`}>{l}</button>)}</div>
    <ul className="grid gap-4 sm:grid-cols-2">{KIT_ROUTES.map((r) => {
      const q = new URLSearchParams({ ref: slug, rebook: "chat", pickup: r.pickup, dropoff: r.dropoff });
      const text = kitCaption(r, lang, { link: `https://waydidi.com/?${q}`, code, discount, price: prices[r.id] });
      return <li key={r.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- small site photos; download uses the same file */}
        <img src={r.image} alt={r.title.en} className="aspect-[16/9] w-full object-cover" loading="lazy" />
        <div className="p-4">
          <p className="font-bold">{r.title[lang]}</p>
          <p className="mt-2 whitespace-pre-line rounded-xl bg-slate-50 p-3 text-[13.5px] leading-6 text-slate-700">{text}</p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => void navigator.clipboard.writeText(text).then(() => { setCopied(r.id); window.setTimeout(() => setCopied(null), 1500); })} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-brand text-[13px] font-semibold text-white hover:bg-brand-strong">{copied === r.id ? <><Check size={15} />Copied</> : <><Copy size={15} />Copy caption</>}</button>
            <a href={r.image} download={`waydidi-${r.id}.webp`} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-brand-tint px-4 text-[13px] font-semibold text-brand-darker"><Download size={15} />Photo</a>
          </div>
        </div>
      </li>;
    })}</ul>
  </div>;
}
