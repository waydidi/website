"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { SPIN_MIN_FARE, SPIN_PRIZES, SPIN_VALID_DAYS, type SpinPrize } from "@/lib/spin-rules";

const SLICE = 360 / SPIN_PRIZES.length;
// Rainbow: red → violet around the wheel. Light hues (yellow, green) get dark text.
const RAINBOW = ["#E53935", "#FB8C00", "#FDD835", "#43A047", "#1E88E5", "#3949AB", "#8E24AA", "#D81B60"];
const sliceColor = (i: number) => RAINBOW[Math.floor((i * RAINBOW.length) / SPIN_PRIZES.length) % RAINBOW.length];
const sliceText = (i: number) => (["#FDD835", "#FB8C00"].includes(sliceColor(i)) ? "#1C1C1C" : "#fff");

function slicePath(i: number) {
  const a0 = ((i * SLICE - 90) * Math.PI) / 180, a1 = (((i + 1) * SLICE - 90) * Math.PI) / 180;
  return `M 100 100 L ${100 + 96 * Math.cos(a0)} ${100 + 96 * Math.sin(a0)} A 96 96 0 0 1 ${100 + 96 * Math.cos(a1)} ${100 + 96 * Math.sin(a1)} Z`;
}

// The wheel popup. The prize comes from the server; the wheel animates to its slice.
export function SpinWheelDialog({ onClose }: { onClose: () => void }) {
  const [rotation, setRotation] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [prize, setPrize] = useState<SpinPrize | null>(null);
  const [shown, setShown] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !spinning) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, spinning]);

  async function spin() {
    if (spinning || prize) return;
    setSpinning(true); setError("");
    try {
      const res = await fetch("/api/spin", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const data = (await res.json()) as { prize?: SpinPrize | null; error?: string };
      if (!res.ok || !data.prize) throw new Error(data.error || "The wheel is stuck. Please try again.");
      const i = SPIN_PRIZES.findIndex((p) => p.id === data.prize!.id);
      setPrize(data.prize);
      setRotation(360 * 6 + (360 - (i * SLICE + SLICE / 2)));
      window.setTimeout(() => { setShown(true); setSpinning(false); window.dispatchEvent(new Event("waydidi:spun")); }, 4700);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The wheel is stuck. Please try again.");
      setSpinning(false);
    }
  }

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true" aria-labelledby="spin-title">
    <div className="relative w-full max-w-[380px] rounded-[28px] bg-white px-6 pb-6 pt-7 text-center shadow-2xl">
      <button type="button" onClick={onClose} disabled={spinning} aria-label="Close" className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 disabled:opacity-40"><X size={18} /></button>
      <h2 id="spin-title" className="text-[22px] font-black tracking-[-.02em] text-[#1C1C1C]">{shown && prize ? "You won!" : "Spin the wheel"}</h2>
      <p className="mt-1 text-[14px] text-slate-600">{shown && prize ? prize.label : "One free spin per account. Every slice is a prize."}</p>

      <div className="relative mx-auto mt-5 aspect-square w-full max-w-[290px]">
        <span className="absolute left-1/2 top-[-6px] z-10 -translate-x-1/2 border-x-[13px] border-t-[22px] border-x-transparent border-t-[#1C1C1C] drop-shadow" aria-hidden="true" />
        <svg viewBox="0 0 200 200" className="size-full drop-shadow-[0_10px_24px_rgba(0,0,0,.18)]" style={{ transform: `rotate(${rotation}deg)`, transition: spinning ? "transform 4.5s cubic-bezier(.17,.67,.12,1)" : "none" }} aria-hidden="true">
          <circle cx="100" cy="100" r="99" fill="#fff" />
          {SPIN_PRIZES.map((p, i) => <g key={p.id}>
            <path d={slicePath(i)} fill={sliceColor(i)} stroke="#fff" strokeWidth="2" />
            <text x="100" y="36" transform={`rotate(${i * SLICE + SLICE / 2} 100 100)`} textAnchor="middle" fill={sliceText(i)} fontSize="13" fontWeight="800">{p.short}</text>
          </g>)}
          <circle cx="100" cy="100" r="99" fill="none" stroke="#1C1C1C" strokeWidth="2" />
        </svg>
        <button type="button" onClick={spin} disabled={spinning || Boolean(prize)} className="absolute left-1/2 top-1/2 grid size-[68px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white bg-[#1C1C1C] text-[15px] font-black text-white shadow-lg disabled:cursor-default">{prize ? "🎉" : "SPIN"}</button>
      </div>

      {error && <p className="mt-3 text-sm font-semibold text-red-600">{error}</p>}
      {shown && prize ? <>
        <p className="mt-4 text-[13px] leading-5 text-slate-500">Taken off automatically at checkout when you&apos;re signed in. Valid for {SPIN_VALID_DAYS} days, once, on fares from THB {SPIN_MIN_FARE.toLocaleString("en-US")}.</p>
        <Link href="/#booking-search" onClick={onClose} className="mt-4 flex h-12 items-center justify-center rounded-full bg-[#FF8A05] text-[16px] font-bold text-white hover:bg-[#F07A00]">Book a ride</Link>
      </> : <button type="button" onClick={spin} disabled={spinning} className="mt-5 h-12 w-full rounded-full bg-[#FF8A05] text-[16px] font-bold text-white hover:bg-[#F07A00] disabled:opacity-70">{spinning ? "Spinning…" : "Spin now"}</button>}
    </div>
  </div>;
}
