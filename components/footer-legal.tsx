import { PrivacyChoices } from "@/components/privacy-choices";

// Add the Thai company registration / TAT licence numbers here once issued;
// each non-empty entry is appended to the copyright line.
const LEGAL_IDS: string[] = [];

export function FooterLegal() {
  return <div className="mt-12 border-t border-white/30 pt-8 text-white">
    <PrivacyChoices />
    <p className="mt-2 text-base leading-7">{["2026 © WAYDIDI™", "All rights reserved", ...LEGAL_IDS].join(" | ")}</p>
  </div>;
}
