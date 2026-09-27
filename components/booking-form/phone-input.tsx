"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

// Common home countries of Waydidi guests; Thailand first.
const COUNTRIES: [string, string, string][] = [
  ["TH", "🇹🇭", "+66"], ["GB", "🇬🇧", "+44"], ["US", "🇺🇸", "+1"], ["AU", "🇦🇺", "+61"], ["CN", "🇨🇳", "+86"], ["HK", "🇭🇰", "+852"],
  ["TW", "🇹🇼", "+886"], ["SG", "🇸🇬", "+65"], ["MY", "🇲🇾", "+60"], ["IN", "🇮🇳", "+91"], ["JP", "🇯🇵", "+81"], ["KR", "🇰🇷", "+82"],
  ["DE", "🇩🇪", "+49"], ["FR", "🇫🇷", "+33"], ["NL", "🇳🇱", "+31"], ["IT", "🇮🇹", "+39"], ["ES", "🇪🇸", "+34"], ["CH", "🇨🇭", "+41"],
  ["SE", "🇸🇪", "+46"], ["DK", "🇩🇰", "+45"], ["NO", "🇳🇴", "+47"], ["FI", "🇫🇮", "+358"], ["IE", "🇮🇪", "+353"], ["RU", "🇷🇺", "+7"],
  ["IL", "🇮🇱", "+972"], ["AE", "🇦🇪", "+971"], ["SA", "🇸🇦", "+966"], ["NZ", "🇳🇿", "+64"], ["CA", "🇨🇦", "+1"], ["VN", "🇻🇳", "+84"],
  ["ID", "🇮🇩", "+62"], ["PH", "🇵🇭", "+63"], ["KH", "🇰🇭", "+855"], ["LA", "🇱🇦", "+856"], ["MM", "🇲🇲", "+95"], ["BR", "🇧🇷", "+55"],
];

/** Splits "+44 7700 900123" into its dial code and the rest, if the code is known. */
function split(value: string) {
  const match = COUNTRIES.map((c) => c[2]).sort((x, y) => y.length - x.length).find((code) => value.startsWith(`${code} `) || value === code);
  return match ? { code: match, rest: value.slice(match.length).trim() } : null;
}

// Country code picker + number; reports "+CC number". Defaults to the phone's region.
export function PhoneInput({ value, onChange, inputRef, className }: { value: string; onChange: (v: string) => void; inputRef?: React.Ref<HTMLInputElement>; className: string }) {
  const parsed = split(value);
  const [code, setCode] = useState(parsed?.code ?? "+66");
  const rest = parsed ? parsed.rest : value;

  useEffect(() => {
    if (value) return;
    const region = (navigator.languages?.[0] ?? navigator.language ?? "").split("-")[1]?.toUpperCase();
    const found = COUNTRIES.find((c) => c[0] === region);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default from the browser's region, once
    if (found) setCode(found[2]);
  }, [value]);

  return <div className="flex items-stretch gap-2.5">
    <label className="relative shrink-0">
      <span className="sr-only">Country code</span>
      <select value={COUNTRIES.find((c) => c[2] === code)?.[0] ?? "TH"} onChange={(e) => { const c = COUNTRIES.find((x) => x[0] === e.target.value); if (c) { setCode(c[2]); if (rest) onChange(`${c[2]} ${rest}`); } }} className="h-16 appearance-none rounded-2xl border-2 border-[#F0E3D4] bg-white pl-3 pr-8 text-[18px] outline-none transition focus:border-[#FF8A05] focus:ring-4 focus:ring-[#FF8A05]/15">
        {COUNTRIES.map(([id, flag, dial]) => <option key={id} value={id}>{flag} {dial}</option>)}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9A8F86]" />
    </label>
    <input ref={inputRef} type="tel" inputMode="tel" autoComplete="tel-national" value={rest} onChange={(e) => onChange(e.target.value.trim() ? `${code} ${e.target.value}` : "")} placeholder="81 234 5678" className={className} />
  </div>;
}
