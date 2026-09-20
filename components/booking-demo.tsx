"use client";

import { Check, Luggage, MapPin, Users } from "lucide-react";
import { useEffect, useState } from "react";

const steps = [
  { title: "Enter your trip", subtitle: "BKK Airport → Pattaya" },
  { title: "Choose your ride", subtitle: "Comfort SUV selected" },
  { title: "Review your fare", subtitle: "Clear price before you book" },
  { title: "Booking confirmed", subtitle: "Your Waydidi ride is ready" },
];

export function BookingDemo() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches) return;
    const id = window.setInterval(() => setStep((value) => (value + 1) % steps.length), 2600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className="booking-demo mx-auto max-w-[1024px] px-5 py-14 lg:px-0 lg:py-20" aria-labelledby="booking-demo-title">
      <div className="grid items-center gap-10 lg:grid-cols-[.82fr_1.18fr] lg:gap-16">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-[#D96F00]">Simple private travel</p>
          <h2 id="booking-demo-title" className="mt-3 text-3xl font-bold tracking-[-.04em] sm:text-[2rem]">Booking your ride is simple</h2>
          <p className="mt-4 max-w-md text-base leading-7 text-slate-600">Enter your journey, choose the vehicle that fits you, review your fare and confirm. Waydidi keeps every step clear.</p>
          <div className="mt-7 grid gap-2">
            {steps.map((item, index) => (
              <button key={item.title} type="button" onClick={() => setStep(index)} className={`booking-demo-step flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${step === index ? "bg-[#FFF0DF]" : "hover:bg-slate-50"}`}>
                <span className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold ${step === index ? "bg-[#FF8A05] text-white" : "bg-slate-100 text-slate-500"}`}>{index + 1}</span>
                <span><strong className="block text-sm">{item.title}</strong><span className="text-xs text-slate-500">{item.subtitle}</span></span>
              </button>
            ))}
          </div>
        </div>

        <div className="booking-demo-stage relative mx-auto w-full max-w-[520px]">
          <div className="booking-demo-orb" aria-hidden="true" />
          <div className="booking-demo-phone">
            <div className="booking-demo-speaker" />
            <div className="booking-demo-screen">
              <div className="flex items-center justify-between border-b border-white/15 bg-[#FF8A05] px-5 py-4 text-white">
                <strong className="text-lg">waydidi</strong><span className="text-xs font-bold">Private ride</span>
              </div>
              <div className="p-5">
                <p className="text-[11px] font-bold uppercase tracking-[.15em] text-slate-400">Your journey</p>
                <div className="mt-3 rounded-2xl bg-slate-50 p-4">
                  <div className="flex gap-3"><MapPin size={18} className="mt-0.5 shrink-0 text-[#FF8A05]"/><div><span className="block text-xs text-slate-400">Pickup</span><strong className="text-sm">Suvarnabhumi Airport (BKK)</strong></div></div>
                  <div className="ml-[8px] my-2 h-5 border-l-2 border-dotted border-slate-300"/>
                  <div className="flex gap-3"><MapPin size={18} className="mt-0.5 shrink-0 text-[#21140A]"/><div><span className="block text-xs text-slate-400">Drop-off</span><strong className="text-sm">Pattaya</strong></div></div>
                </div>
                <div className="mt-3 flex gap-2 text-xs font-bold"><span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-2"><Users size={14}/>2</span><span className="flex items-center gap-1 rounded-full bg-slate-100 px-3 py-2"><Luggage size={14}/>2</span></div>

                <div className={`booking-demo-panel mt-4 ${step === 0 ? "is-active" : ""}`}><p className="text-sm font-bold">Trip details ready</p><p className="mt-1 text-xs text-slate-500">Choose your pickup date and time, then continue.</p><div className="mt-3 rounded-xl bg-[#21140A] py-3 text-center text-sm font-bold text-white">Find a ride</div></div>
                <div className={`booking-demo-panel mt-4 ${step === 1 ? "is-active" : ""}`}><div className="rounded-2xl border-2 border-[#FF8A05] bg-[#FFF7ED] p-4"><div className="flex justify-between"><div><strong className="block">Comfort SUV</strong><span className="text-xs text-slate-500">Up to 4 passengers</span></div><span className="grid size-7 place-items-center rounded-full bg-[#FF8A05] text-white"><Check size={15}/></span></div></div></div>
                <div className={`booking-demo-panel mt-4 ${step === 2 ? "is-active" : ""}`}><div className="rounded-2xl bg-[#21140A] p-4 text-white"><span className="text-xs text-white/60">Your fare</span><div className="mt-1 flex items-end justify-between"><strong>Comfort SUV</strong><strong className="text-2xl">฿2,200</strong></div><p className="mt-2 text-[11px] text-white/60">Private ride · price shown before payment</p></div></div>
                <div className={`booking-demo-panel mt-4 ${step === 3 ? "is-active" : ""}`}><div className="rounded-2xl bg-[#FFF0DF] p-4 text-center"><span className="mx-auto grid size-10 place-items-center rounded-full bg-[#FF8A05] text-white"><Check size={21}/></span><strong className="mt-2 block">Booking confirmed</strong><span className="text-xs text-slate-500">BKK Airport → Pattaya</span></div></div>
              </div>
            </div>
          </div>
          <div className="booking-demo-float"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Step {step + 1} of 4</span><strong className="mt-1 block text-lg">{steps[step].title}</strong><span className="text-xs text-slate-500">{steps[step].subtitle}</span></div>
        </div>
      </div>
    </section>
  );
}
