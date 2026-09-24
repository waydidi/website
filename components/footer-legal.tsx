import { PrivacyChoices } from "@/components/privacy-choices";

// Add the Thai company registration / TAT licence numbers here once issued;
// each non-empty entry is appended to the copyright line.
const LEGAL_IDS: string[] = [];

function PaymentLogos() {
  const logo = "h-8 shrink-0 text-white";
  return <ul className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-5" aria-label="Accepted payment methods">
    <li aria-label="Visa" className={`${logo} flex items-center text-[28px] font-black italic leading-none tracking-[-.04em]`}>VISA</li>
    <li aria-label="Mastercard" className={logo}>
      <svg viewBox="0 0 52 32" className="h-8" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="currentColor" opacity=".95" /><circle cx="36" cy="16" r="15" fill="currentColor" opacity=".6" /><text x="26" y="19.5" textAnchor="middle" fontSize="9" fontWeight="800" fontStyle="italic" fill="#FF8A05">MasterCard</text></svg>
    </li>
    <li aria-label="PromptPay" className={`${logo} flex items-center text-2xl font-extrabold italic leading-none`}>PromptPay</li>
    <li aria-label="Apple Pay" className={`${logo} flex items-center gap-0.5 text-[28px] font-medium leading-none`}>
      <svg viewBox="0 0 170 170" className="h-6 w-6" fill="currentColor" aria-hidden="true"><path d="M150 132c-3 7-6 13-10 19-5 8-10 13-13 16-5 5-11 7-17 7-4 0-9-1-15-4-6-2-11-4-16-4s-10 2-16 4c-6 3-11 4-14 4-6 0-12-2-17-8-4-3-8-9-13-17-6-9-10-19-14-30-4-12-6-24-6-35 0-13 3-24 8-33 5-7 10-12 17-16 7-4 14-6 22-6 4 0 10 1 17 4 7 3 12 4 14 4 2 0 7-2 15-5 8-3 15-4 20-3 15 1 26 7 34 18-13 8-20 20-20 34 0 11 4 21 12 28 4 4 8 6 12 8-1 3-2 5-3 8ZM119 7c0 9-3 17-10 25-8 9-17 14-27 13v-3c0-8 4-17 10-24 3-4 7-7 12-9 5-3 10-4 14-4v2Z" /></svg>Pay
    </li>
    <li aria-label="Google Pay" className={`${logo} flex items-center gap-1 text-[28px] font-medium leading-none`}><span className="font-bold">G</span>Pay</li>
  </ul>;
}

export function FooterLegal() {
  return <div className="mt-12 border-t border-white/30 pt-8 text-white">
    <PrivacyChoices />
    <p className="mt-6 text-base leading-7">{["2026 © WAYDIDI™", "All rights reserved", ...LEGAL_IDS].join(" | ")}</p>
    <PaymentLogos />
  </div>;
}
