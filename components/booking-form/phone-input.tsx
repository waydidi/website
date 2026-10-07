"use client";

import { Check, ChevronDown, Search, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useState } from "react";
import { COUNTRIES, MAIN_COUNTRY } from "@/lib/country-codes";



function Flag({ country, size }: { country: string; size: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- tiny local SVG, as in the locale picker
  return <img src={`/flags/${country}.svg`} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover ring-1 ring-black/10" />;
}

/** Splits "+44 7700 900123" into its dial code and the rest, if the code is known. */
function split(value: string) {
  const match = COUNTRIES.map((c) => c[1]).sort((x, y) => y.length - x.length).find((code) => value.startsWith(`${code} `) || value === code);
  return match ? { code: match, rest: value.slice(match.length).trim() } : null;
}

// Round-flag country code button (opens a searchable list) + number; reports "+CC number".
export function PhoneInput({ value, onChange, inputRef, className }: { value: string; onChange: (v: string) => void; inputRef?: React.Ref<HTMLInputElement>; className: string }) {
  const parsed = split(value);
  const [country, setCountry] = useState(() => (parsed ? MAIN_COUNTRY[parsed.code] ?? COUNTRIES.find((c) => c[1] === parsed.code)?.[0] : undefined) ?? "th");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const code = COUNTRIES.find((c) => c[0] === country)?.[1] ?? "+66";
  const rest = parsed ? parsed.rest : value;

  useEffect(() => {
    if (value) return;
    const region = (navigator.languages?.[0] ?? navigator.language ?? "").split("-")[1]?.toLowerCase();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default from the browser's region, once
    if (region && COUNTRIES.some((c) => c[0] === region)) setCountry(region);
  }, [value]);

  const needle = query.trim().toLowerCase().replace(/^\+/, "");
  const matches = needle ? COUNTRIES.filter(([, dial, name]) => name.toLowerCase().includes(needle) || dial.slice(1).startsWith(needle)) : COUNTRIES;

  function pick(id: string, dial: string) {
    setCountry(id); setOpen(false); setQuery("");
    if (rest) onChange(`${dial} ${rest}`);
  }

  return <div className="flex items-stretch gap-2.5">
    <button type="button" onClick={() => setOpen(true)} aria-label={`Country code ${code}`} className="flex h-16 shrink-0 items-center gap-2 rounded-2xl border-2 border-[#F0E3D4] bg-white pl-3 pr-2.5 text-[18px] outline-none transition hover:border-[#FFC98A] focus-visible:border-brand focus-visible:ring-4 focus-visible:ring-brand/15">
      <Flag country={country} size={26} /><span className="tabular-nums">{code}</span><ChevronDown size={16} className="text-[#9A8F86]" />
    </button>
    <input ref={inputRef} type="tel" inputMode="tel" autoComplete="tel-national" value={rest} onChange={(e) => onChange(e.target.value.trim() ? `${code} ${e.target.value}` : "")} placeholder="81 234 5678" className={className} />

    <DialogPrimitive.Root open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-x-0 bottom-0 z-[81] flex h-[40dvh] min-h-[260px] flex-col rounded-t-[24px] bg-white text-plum shadow-2xl outline-none data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:h-auto sm:min-h-0 sm:max-h-[70dvh] sm:w-[440px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[24px] sm:data-[state=open]:slide-in-from-bottom-4 sm:data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between px-5 pb-2 pt-5">
            <DialogPrimitive.Title className="text-[20px] font-bold">Country code</DialogPrimitive.Title>
            <DialogPrimitive.Close className="grid size-9 place-items-center rounded-full bg-[#F6F1EB] hover:bg-brand-tint" aria-label="Close"><X size={20} /></DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">Search and choose the country code for your WhatsApp number</DialogPrimitive.Description>
          <div className="px-5 pb-2">
            <label className="flex h-12 items-center gap-2 rounded-2xl border-2 border-[#F0E3D4] bg-[#FFFBF6] px-4 focus-within:border-brand">
              <Search size={18} className="shrink-0 text-[#9A8F86]" aria-hidden="true" />
              <span className="sr-only">Search country or code</span>
              {/* 16px text so iPhone Safari does not zoom in on focus. */}
              <input type="search" autoFocus={typeof window !== "undefined" && window.matchMedia("(min-width: 640px)").matches} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search country or code" className="w-full bg-transparent text-base outline-none placeholder:text-[#BDB2A8]" />
            </label>
          </div>
          <ul className="flex-1 overflow-y-auto px-3 pb-[max(16px,env(safe-area-inset-bottom))]">
            {matches.length === 0 && <li className="px-3 py-8 text-center text-[#6B6170]">No countries match &ldquo;{query}&rdquo;.</li>}
            {matches.map(([id, dial, name]) => {
              const selected = id === country;
              return <li key={id}><button type="button" onClick={() => pick(id, dial)} aria-current={selected || undefined} className={`flex min-h-14 w-full items-center gap-3.5 rounded-xl px-3 text-left text-[16px] transition ${selected ? "bg-brand-tint font-semibold" : "hover:bg-[#FFF7EE]"}`}>
                <Flag country={id} size={30} /><span className="flex-1">{name}</span><span className="tabular-nums text-[#6B6170]">{dial}</span>
                {selected && <Check size={18} className="text-brand" />}
              </button></li>;
            })}
          </ul>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  </div>;
}
