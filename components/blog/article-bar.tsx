"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, List, X } from "lucide-react";

// Mobile bar that appears once the reader scrolls: "Contents" opens the table of
// contents, and "Book this ride" goes to the search with the guide's route filled in.
export function ArticleBar({ headings, bookHref }: { headings: { id: string; text: string }[]; bookHref?: string }) {
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!headings.length && !bookHref) return null;
  return <div className={`fixed inset-x-0 bottom-0 z-40 border-t border-[#E6E4DE] bg-white/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur transition-transform lg:hidden ${visible ? "translate-y-0" : "translate-y-full"}`}>
    {open && <nav aria-label="Contents" className="mb-3 max-h-[50vh] overflow-y-auto rounded-2xl border border-[#E6E4DE] bg-white p-2 shadow-lg">
      <p className="flex items-center justify-between px-2 py-1 text-[14px] font-bold">In this guide<button type="button" onClick={() => setOpen(false)} aria-label="Close contents" className="grid size-8 place-items-center rounded-full hover:bg-slate-100"><X size={16} /></button></p>
      <ol>{headings.map((h) => <li key={h.id}><a href={`#${h.id}`} onClick={() => setOpen(false)} className="block rounded-lg px-2 py-2 text-[15px] hover:bg-[#FFF6EB]">{h.text}</a></li>)}</ol>
    </nav>}
    <div className="flex gap-2">
      {headings.length > 0 && <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex h-12 items-center gap-2 rounded-full border border-[#D6D3CC] px-4 text-[15px] font-semibold"><List size={18} aria-hidden="true" />Contents</button>}
      {bookHref && <Link href={bookHref} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#FF8A05] text-[16px] font-semibold text-white">Book this ride <ArrowRight size={18} aria-hidden="true" /></Link>}
    </div>
  </div>;
}
