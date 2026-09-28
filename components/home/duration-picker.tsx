"use client";

import { Clock3 } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useEffect, useRef, useState } from "react";

const ROW = 48;

// Duration field for hourly bookings: opens a centred wheel, like setting an alarm.
export function DurationPicker({ value, options, label, format, onChange, className }: { value: number; options: number[]; label: string; format: (n: number) => string; onChange: (n: number) => void; className: string }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const wheel = useRef<HTMLDivElement>(null);
  const settle = useRef<number | undefined>(undefined);

  // Scroll the wheel to the current value when it opens.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => { wheel.current?.scrollTo({ top: Math.max(0, options.indexOf(draft)) * ROW }); }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onScroll() {
    window.clearTimeout(settle.current);
    settle.current = window.setTimeout(() => {
      const i = Math.round((wheel.current?.scrollTop ?? 0) / ROW);
      setDraft(options[Math.max(0, Math.min(options.length - 1, i))]);
    }, 80);
  }
  const pick = (n: number) => { setDraft(n); wheel.current?.scrollTo({ top: options.indexOf(n) * ROW, behavior: "smooth" }); };

  return <DialogPrimitive.Root open={open} onOpenChange={(o) => { if (o) setDraft(value); setOpen(o); }}>
    <DialogPrimitive.Trigger asChild>
      <button type="button" className={className}>
        <Clock3 size={18} className="shrink-0" />
        <span className="min-w-0 text-left"><span className="block text-[13px]/[18px] font-normal text-slate-500">{label}</span><span className="block text-base/[22px] font-normal text-ink">{format(value)}</span></span>
      </button>
    </DialogPrimitive.Trigger>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in" />
      <DialogPrimitive.Content aria-describedby={undefined} className="font-home fixed left-1/2 top-1/2 z-[81] w-[min(340px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 rounded-[28px] bg-white p-5 text-ink shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:zoom-in-95">
        <DialogPrimitive.Title className="text-center text-[17px] font-bold">{label}</DialogPrimitive.Title>
        <div className="relative mt-3 h-[240px] overflow-hidden">
          {/* Selection band and fades above/below, as in an alarm clock. */}
          <div className="pointer-events-none absolute inset-x-0 top-1/2 h-12 -translate-y-1/2 rounded-2xl bg-[#FFF0DF]" />
          <div ref={wheel} onScroll={onScroll} className="relative h-full snap-y snap-mandatory overflow-y-scroll overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ paddingBlock: 96 }}>
            {options.map((n) => <button key={n} type="button" onClick={() => pick(n)} className={`flex h-12 w-full snap-center items-center justify-center text-[22px] tabular-nums transition ${n === draft ? "font-bold text-[#D96F00]" : "text-slate-400"}`}>{format(n)}</button>)}
          </div>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white to-transparent" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <DialogPrimitive.Close className="h-12 rounded-2xl bg-slate-100 text-[15px] font-semibold text-slate-700">Cancel</DialogPrimitive.Close>
          <button type="button" onClick={() => { onChange(draft); setOpen(false); }} className="h-12 rounded-2xl bg-brand text-[15px] font-semibold text-white">Done</button>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
