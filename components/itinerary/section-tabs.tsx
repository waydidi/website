"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The tab bar under the photos: sticks just below the site header (the slim itinerary header: 56px, 64px on large screens), jumps to a section
 * and marks the section being read. A tapped tab stays marked while the page scrolls to it, even when the page is too
 * short to bring that section to the top.
 */
export function SectionTabs({ tabs, label }: { tabs: { id: string; label: string }[]; label: string }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const bar = useRef<HTMLElement>(null);
  const held = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      if (held.current) return;
      const line = (bar.current?.getBoundingClientRect().bottom ?? 0) + 12;
      const current = [...tabs].reverse().find((t) => (document.getElementById(t.id)?.getBoundingClientRect().top ?? Infinity) <= line);
      setActive(current?.id ?? tabs[0]?.id);
    };
    const onScroll = () => {
      // While a tapped tab scrolls the page, keep it marked until scrolling stops.
      if (held.current) { clearTimeout(held.current); held.current = setTimeout(() => { held.current = null; }, 200); return; }
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); if (frame) cancelAnimationFrame(frame); if (held.current) clearTimeout(held.current); };
  }, [tabs]);
  // Bring the marked tab into view inside the bar only (sideways), never scrolling the page itself.
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const ul = list.current, tab = document.getElementById(`tab-${active}`);
    if (!ul || !tab) return;
    if (tab.offsetLeft < ul.scrollLeft) ul.scrollTo({ left: tab.offsetLeft, behavior: "smooth" });
    else if (tab.offsetLeft + tab.offsetWidth > ul.scrollLeft + ul.clientWidth) ul.scrollTo({ left: tab.offsetLeft + tab.offsetWidth - ul.clientWidth, behavior: "smooth" });
  }, [active]);
  const choose = (id: string) => { setActive(id); if (held.current) clearTimeout(held.current); held.current = setTimeout(() => { held.current = null; }, 1000); };
  return <nav ref={bar} aria-label={label} className="sticky top-[56px] z-30 border-b border-slate-200 bg-white shadow-[0_2px_10px_rgba(0,0,0,.06)] lg:top-[64px]">
    <ul ref={list} className="relative mx-auto flex max-w-[880px] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((t) => <li key={t.id} className="shrink-0 border-r border-slate-100 last:border-r-0">
        <a id={`tab-${t.id}`} href={`#${t.id}`} aria-current={active === t.id ? "location" : undefined} onClick={() => choose(t.id)}
          className={`flex min-h-[52px] items-center border-b-[3px] px-5 text-[16px] font-semibold ${active === t.id ? "border-brand text-plum" : "border-transparent text-slate-600 hover:text-plum"}`}>{t.label}</a>
      </li>)}
    </ul>
  </nav>;
}
