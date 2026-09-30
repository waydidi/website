"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { TRANSFER_PARTNERS } from "@/lib/transfer-partners";

export function TransferPartners() {
  const [selected, setSelected] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const next = event.key === "Home" ? 0 : event.key === "End" ? 1 : event.key === "ArrowRight" || event.key === "ArrowLeft" ? 1 - index : null;
    if (next === null) return;
    event.preventDefault();
    setSelected(next);
    tabs.current[next]?.focus();
  }

  return <section id="transfer-partners" aria-labelledby="transfer-partners-heading" className="font-home mx-auto max-w-[1180px] px-[10px] pb-16 pt-16 text-[#171D21] sm:px-5 sm:py-20 lg:py-24">
    <h2 id="transfer-partners-heading" className="mx-auto max-w-[700px] px-5 text-center text-[26px] font-semibold leading-[1.1] tracking-[-.02em] sm:text-[36px] lg:text-[44px]">The transfer partner<br />you can rely on</h2>
    <div role="tablist" aria-label="Partnership type" className="mx-auto mb-7 mt-8 flex w-fit max-w-full justify-center gap-2 px-1 sm:mb-10 sm:mt-10 sm:gap-3">
      {TRANSFER_PARTNERS.map((partner, index) => <button
        key={partner.id}
        ref={(el) => { tabs.current[index] = el; }}
        id={`transfer-partner-tab-${partner.id}`}
        type="button"
        role="tab"
        aria-selected={selected === index}
        aria-controls={`transfer-partner-panel-${partner.id}`}
        tabIndex={selected === index ? 0 : -1}
        onClick={() => setSelected(index)}
        onKeyDown={(event) => onKeyDown(event, index)}
        className={`min-h-9 rounded-full px-3 py-2 text-[13px] leading-[1.2] tracking-[-.02em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FE8B05] min-[375px]:px-4 min-[375px]:text-[14px] sm:min-h-12 sm:px-6 sm:text-[18px] ${selected === index ? "bg-[#171D21] text-white" : "bg-[#F2F3F6] text-[#171D21] hover:bg-slate-200"}`}
      >{partner.label}</button>)}
    </div>
    {TRANSFER_PARTNERS.map((partner, index) => <div
      key={partner.id}
      id={`transfer-partner-panel-${partner.id}`}
      role="tabpanel"
      aria-labelledby={`transfer-partner-tab-${partner.id}`}
      tabIndex={0}
      hidden={selected !== index}
      className={`rounded-[28px] px-[22px] pb-8 pt-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#FE8B05] sm:rounded-[32px] sm:p-10 lg:p-14 ${partner.gradient}`}
    >
      <h3 className="max-w-[850px] text-[20px] font-semibold leading-[1.15] tracking-[-.025em] sm:text-[28px] lg:text-[32px]">{partner.title}</h3>
      <p className="mt-4 max-w-[940px] text-[14px] leading-[1.33] tracking-[-.01em] sm:mt-6 sm:text-[18px] sm:leading-[1.5]">{partner.description}</p>
      <p className="mt-8 text-[14px] font-bold leading-[1.33] tracking-[-.02em] sm:mt-10 sm:text-[18px]">Partnering with Waydidi includes:</p>
      <ul className="mt-2 space-y-1.5 text-[14px] leading-[1.33] tracking-[-.01em] text-[#50575B] sm:mt-4 sm:space-y-3 sm:text-[18px]">
        {partner.benefits.map((benefit) => <li key={benefit} className="flex items-start gap-2"><Check className="mt-0.5 size-4 shrink-0 text-[#171D21] sm:size-5" strokeWidth={1.8} aria-hidden="true" /><span>{benefit}</span></li>)}
      </ul>
      <div className="mt-8 flex flex-col items-center gap-5 sm:mt-10 sm:gap-6">
        <Link href={partner.href} className="inline-flex min-h-11 items-center justify-center rounded-full bg-white px-6 py-3 text-center text-[16px] font-semibold leading-[1.1] tracking-[-.02em] transition hover:bg-white/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171D21] sm:min-h-14 sm:px-9 sm:text-[20px]">{partner.action}</Link>
        <Link href={partner.learnMore} className="rounded text-[16px] font-semibold leading-[1.1] tracking-[-.02em] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#171D21] sm:text-[20px]">Learn more</Link>
      </div>
    </div>)}
  </section>;
}
