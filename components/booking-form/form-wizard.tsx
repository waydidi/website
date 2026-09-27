"use client";

import { ArrowRight, Check, ChevronDown, ChevronUp, LoaderCircle, Luggage, Minus, Plus, UsersRound } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CHILD_SEAT_THB, EXCHANGE_STOP_THB, FERRY_HOTEL_THB } from "@/lib/addons";
import { offersFerry, type FormService } from "@/lib/booking-form";
import { isAirportPickup } from "@/lib/trip-rules";
import { smallestFittingVehicle, VEHICLES, vehicleFits, type VehicleId } from "@/lib/vehicles";

type Answers = {
  name: string; phone: string; email: string;
  pickup: string; flightNumber: string; dropoff: string; hours: number; date: string; time: string;
  returnTrip: boolean | null; returnDate: string; returnTime: string;
  passengers: number; luggage: number; vehicle: VehicleId; childSeats: number; exchangeStop: boolean; ferryPeople: number;
};
type StepId = "name" | "phone" | "email" | "trip" | "return" | "ride";

const blank: Answers = {
  name: "", phone: "", email: "", pickup: "", flightNumber: "", dropoff: "", hours: 4, date: "", time: "",
  returnTrip: null, returnDate: "", returnTime: "",
  passengers: 2, luggage: 2, vehicle: "economy_sedan", childSeats: 0, exchangeStop: false, ferryPeople: 0,
};

const bigInput = "w-full border-0 border-b-2 border-[#FFC98A] bg-transparent pb-2 text-[24px] text-[#1F1726] outline-none placeholder:text-[#C9BFB5] focus:border-[#FF8A05] sm:text-[28px]";
const smallLabel = "block text-[14px] font-medium text-[#6B6170]";
const smallInput = "mt-1 w-full border-0 border-b-2 border-[#FFC98A] bg-transparent pb-1.5 text-[19px] text-[#1F1726] outline-none placeholder:text-[#C9BFB5] focus:border-[#FF8A05]";
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

function Stepper({ value, set, min, max, label }: { value: number; set: (n: number) => void; min: number; max: number; label: string }) {
  return <span className="flex items-center gap-3">
    <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => set(value - 1)} className="grid size-10 place-items-center rounded-full border border-[#E5DDD4] bg-white disabled:opacity-40"><Minus size={18} /></button>
    <span className="w-6 text-center text-[20px] font-semibold tabular-nums" aria-live="polite">{value}</span>
    <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => set(value + 1)} className="grid size-10 place-items-center rounded-full border border-[#E5DDD4] bg-white disabled:opacity-40"><Plus size={18} /></button>
  </span>;
}

// Typeform-style booking form: one step per screen, Enter to continue, progress saved on the device.
export function FormWizard({ token, service }: { token: string; service: FormService }) {
  const storageKey = `waydidi-form-${token}`;
  const [a, setA] = useState<Answers>(blank);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const firstInput = useRef<HTMLInputElement>(null);

  // Restore saved answers once, then keep saving as the customer types.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "null") as { a?: Answers; index?: number } | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from device storage
      if (saved?.a) { setA({ ...blank, ...saved.a }); setIndex(saved.index ?? 0); }
    } catch { /* storage blocked */ }
  }, [storageKey]);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify({ a, index })); } catch { /* storage blocked */ } }, [a, index, storageKey]);

  const steps: StepId[] = ["name", "phone", "email", "trip", ...(service === "transfer" ? ["return" as const] : []), "ride"];
  const step = steps[Math.min(index, steps.length - 1)];
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => { setA((c) => ({ ...c, [k]: v })); setError(""); };
  const airport = isAirportPickup({ pickup: a.pickup, flightNumber: null });
  const ferry = service !== "hourly" && offersFerry(a.pickup, a.dropoff);
  const firstName = a.name.trim().split(/\s+/)[0] ?? "";

  useEffect(() => { firstInput.current?.focus({ preventScroll: true }); }, [step]);

  function problem(id: StepId): string {
    if (id === "name" && a.name.trim().length < 2) return "Please type your full name.";
    if (id === "phone" && a.phone.replace(/\D/g, "").length < 7) return "Please add your WhatsApp number with country code.";
    if (id === "email" && !/^\S+@\S+\.\S+$/.test(a.email.trim())) return "Please check your email address.";
    if (id === "trip") {
      if (a.pickup.trim().length < 2) return "Where should we pick you up?";
      if (service !== "hourly" && a.dropoff.trim().length < 2) return service === "tour" ? "Which tour would you like?" : "Where are you going?";
      if (!a.date || !a.time) return "Please choose the pickup date and time.";
    }
    if (id === "return") {
      if (a.returnTrip === null) return "Please choose Yes or No.";
      if (a.returnTrip && (!a.returnDate || !a.returnTime)) return "Please choose the return date and time.";
    }
    return "";
  }

  function go(to: number) {
    setDirection(to > index ? 1 : -1);
    setError("");
    setIndex(Math.max(0, Math.min(steps.length - 1, to)));
  }

  async function next() {
    const issue = problem(step);
    if (issue) { setError(issue); return; }
    if (index < steps.length - 1) { go(index + 1); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/forms/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name: a.name, phone: a.phone, email: a.email, pickup: a.pickup,
        flightNumber: airport ? a.flightNumber : "", dropoff: service === "hourly" ? "" : a.dropoff,
        hours: service === "hourly" ? a.hours : undefined, date: a.date, time: a.time,
        returnTrip: service === "transfer" && Boolean(a.returnTrip), returnDate: a.returnTrip ? a.returnDate : "", returnTime: a.returnTrip ? a.returnTime : "",
        passengers: a.passengers, luggage: a.luggage, vehicle: a.vehicle,
        childSeats: a.childSeats, exchangeStop: a.exchangeStop, ferryPeople: ferry ? a.ferryPeople : 0,
      }) });
      const out = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? "Something went wrong. Please try again.");
      try { localStorage.removeItem(storageKey); } catch { /* storage blocked */ }
      setSent(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  function setGroup(passengers: number, luggage: number) {
    setA((c) => ({ ...c, passengers, luggage, vehicle: vehicleFits(c.vehicle, passengers, luggage) ? c.vehicle : smallestFittingVehicle(passengers, luggage) ?? "premium_minivan" }));
  }

  if (sent) return <main className="grid min-h-dvh place-items-center bg-[#FF8A05] px-6 text-white">
    <div className="max-w-md text-center animate-in fade-in zoom-in-95 duration-500">
      <Image src="/waydidi-logo.png" alt="Waydidi" width={180} height={68} className="mx-auto mb-8 h-auto w-40" />
      <span className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-white text-[#FF8A05]"><Check size={34} strokeWidth={3} /></span>
      <h1 className="text-[32px] font-bold leading-tight">Thank you{firstName ? `, ${firstName}` : ""}!</h1>
      <p className="mt-3 text-[17px] text-white/90">We&apos;ve received your details and will confirm your ride shortly on WhatsApp or email.</p>
    </div>
  </main>;

  const progress = Math.round((index / steps.length) * 100);
  const number = index + 1;

  return <main className="flex min-h-dvh flex-col bg-[#FFFBF6] text-[#1F1726]" onKeyDown={(e) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); void next(); }
  }}>
    <div className="fixed inset-x-0 top-0 z-10 h-1.5 bg-[#FFE7CC]"><div className="h-full bg-[#FF8A05] transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
    <header className="px-5 pt-6 sm:px-10"><span className="grid size-11 place-items-center rounded-full bg-[#FF8A05]"><Image src="/waydidi-bird.png" alt="Waydidi" width={28} height={28} className="size-7" /></span></header>

    <section className="flex flex-1 items-center px-5 pb-28 pt-6 sm:px-10">
      <div key={step} className={`mx-auto w-full max-w-xl animate-in fade-in duration-500 ${direction === 1 ? "slide-in-from-bottom-8" : "slide-in-from-top-8"}`}>
        <p className="mb-3 flex items-center gap-1.5 text-[15px] font-semibold text-[#FF8A05]">{number}<ArrowRight size={15} /><span className="text-[#9A8F86]">of {steps.length}</span></p>

        {step === "name" && <>
          <h1 className="text-[28px] font-bold leading-tight sm:text-[34px]">What&apos;s your name?</h1>
          <p className="mt-2 text-[17px] text-[#6B6170]">The lead passenger&apos;s full name, as the driver should greet you.</p>
          <input ref={firstInput} className={`${bigInput} mt-8`} value={a.name} onChange={(e) => set("name", e.target.value)} placeholder="Type your answer here..." autoComplete="name" />
        </>}

        {step === "phone" && <>
          <h1 className="text-[28px] font-bold leading-tight sm:text-[34px]">{firstName ? `Thanks ${firstName}! ` : ""}What&apos;s your WhatsApp number?</h1>
          <p className="mt-2 text-[17px] text-[#6B6170]">Include your country code, e.g. +44 7700 900123. Your driver will message you here.</p>
          <input ref={firstInput} type="tel" inputMode="tel" className={`${bigInput} mt-8`} value={a.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+66 81 234 5678" autoComplete="tel" />
        </>}

        {step === "email" && <>
          <h1 className="text-[28px] font-bold leading-tight sm:text-[34px]">And your email?</h1>
          <p className="mt-2 text-[17px] text-[#6B6170]">We&apos;ll send your booking confirmation here.</p>
          <input ref={firstInput} type="email" inputMode="email" className={`${bigInput} mt-8`} value={a.email} onChange={(e) => set("email", e.target.value)} placeholder="name@example.com" autoComplete="email" />
        </>}

        {step === "trip" && <>
          <h1 className="text-[28px] font-bold leading-tight sm:text-[34px]">{service === "hourly" ? "Tell us about your day" : service === "tour" ? "Tell us about your tour" : "Tell us about your trip"}</h1>
          <div className="mt-7 grid gap-6">
            <label className={smallLabel}>Pickup location<input ref={firstInput} className={smallInput} value={a.pickup} onChange={(e) => set("pickup", e.target.value)} placeholder="Airport, hotel name or address" /></label>
            {airport && <label className={`${smallLabel} animate-in fade-in slide-in-from-top-2`}>Flight number <span className="font-normal text-[#9A8F86]">(optional)</span><input className={smallInput} value={a.flightNumber} onChange={(e) => set("flightNumber", e.target.value.toUpperCase())} placeholder="TG 123" /></label>}
            {service === "hourly"
              ? <div className={smallLabel}>How many hours?<div className="mt-2"><Stepper value={a.hours} set={(n) => set("hours", n)} min={1} max={24} label="hours" /></div></div>
              : <label className={smallLabel}>{service === "tour" ? "Which tour?" : "Where are you going?"}<input className={smallInput} value={a.dropoff} onChange={(e) => set("dropoff", e.target.value)} placeholder={service === "tour" ? "e.g. Floating market day trip" : "Hotel name or address"} /></label>}
            <div className="grid grid-cols-2 gap-5">
              <label className={smallLabel}>Pickup date<input type="date" min={today()} className={smallInput} value={a.date} onChange={(e) => set("date", e.target.value)} /></label>
              <label className={smallLabel}>Pickup time<input type="time" className={smallInput} value={a.time} onChange={(e) => set("time", e.target.value)} /></label>
            </div>
          </div>
        </>}

        {step === "return" && <>
          <h1 className="text-[28px] font-bold leading-tight sm:text-[34px]">Do you need a return trip?</h1>
          <p className="mt-2 text-[17px] text-[#6B6170]">From {a.dropoff || "your drop-off"} back to {a.pickup || "your pickup"}.</p>
          <div className="mt-7 grid max-w-sm gap-3">
            {([[true, "A", "Yes, add a return"], [false, "B", "No, one way"]] as const).map(([value, key, text]) => <button key={key} type="button" onClick={() => set("returnTrip", value)} className={`flex h-14 items-center gap-3 rounded-xl border-2 px-4 text-left text-[18px] font-medium transition ${a.returnTrip === value ? "border-[#FF8A05] bg-[#FFF0DF]" : "border-[#F0E3D4] bg-white hover:border-[#FFC98A]"}`}>
              <span className={`grid size-7 place-items-center rounded-md border text-[13px] font-bold ${a.returnTrip === value ? "border-[#FF8A05] bg-[#FF8A05] text-white" : "border-[#E5DDD4] text-[#9A8F86]"}`}>{key}</span>{text}
              {a.returnTrip === value && <Check size={20} className="ml-auto text-[#FF8A05]" />}
            </button>)}
          </div>
          {a.returnTrip && <div className="mt-7 grid grid-cols-2 gap-5 animate-in fade-in slide-in-from-top-2">
            <label className={smallLabel}>Return date<input type="date" min={a.date || today()} className={smallInput} value={a.returnDate} onChange={(e) => set("returnDate", e.target.value)} /></label>
            <label className={smallLabel}>Return time<input type="time" className={smallInput} value={a.returnTime} onChange={(e) => set("returnTime", e.target.value)} /></label>
          </div>}
        </>}

        {step === "ride" && <>
          <h1 className="text-[28px] font-bold leading-tight sm:text-[34px]">Your ride</h1>
          <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border border-[#F0E3D4] bg-white px-5 py-4">
            <span className="flex items-center gap-3"><UsersRound size={24} aria-label="Passengers" /><Stepper value={a.passengers} set={(n) => setGroup(n, a.luggage)} min={1} max={20} label="passengers" /></span>
            <span className="flex items-center gap-3"><Luggage size={24} aria-label="Bags" /><Stepper value={a.luggage} set={(n) => setGroup(a.passengers, n)} min={0} max={30} label="bags" /></span>
          </div>

          <p className="mt-6 text-[15px] font-semibold">Choose your car</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(Object.keys(VEHICLES) as VehicleId[]).map((id) => {
              const v = VEHICLES[id];
              const fits = vehicleFits(id, a.passengers, a.luggage);
              const chosen = a.vehicle === id;
              return <button key={id} type="button" disabled={!fits} onClick={() => set("vehicle", id)} className={`relative rounded-2xl border-2 bg-white p-3 text-left transition disabled:opacity-40 ${chosen ? "border-[#FF8A05] bg-[#FFF7EE]" : "border-[#F0E3D4] hover:border-[#FFC98A]"}`}>
                <Image src={`/vehicle-${id.replace(/_/g, "-")}.webp`} alt="" width={200} height={110} unoptimized className="h-16 w-full object-contain" />
                <span className="mt-1 block text-[15px] font-semibold">{v.name}</span>
                <span className="block text-[13px] text-[#6B6170]">Up to {v.passengers} people · {v.bags} bags</span>
                {chosen && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-[#FF8A05] text-white"><Check size={15} strokeWidth={3} /></span>}
              </button>;
            })}
          </div>

          <p className="mt-6 text-[15px] font-semibold">Extras <span className="font-normal text-[#9A8F86]">(optional)</span></p>
          <ul className="mt-2 divide-y divide-[#F0E3D4] rounded-2xl border border-[#F0E3D4] bg-white px-4">
            {ferry && <li className="flex items-center gap-3 py-3">
              <Image src="/ferry-3d.webp" alt="" width={44} height={44} unoptimized className="size-11 object-contain" />
              <span className="flex-1"><span className="block font-medium">Ferry &amp; Hotel transfer</span><span className="text-[13px] text-[#6B6170]">+THB {FERRY_HOTEL_THB.toLocaleString()} per person</span></span>
              <Stepper value={a.ferryPeople} set={(n) => set("ferryPeople", n)} min={0} max={a.passengers} label="ferry tickets" />
            </li>}
            <li className="flex items-center gap-3 py-3">
              <Image src="/addon-child-seat.webp" alt="" width={44} height={44} unoptimized className="size-11 object-contain" />
              <span className="flex-1"><span className="block font-medium">Child seat</span><span className="text-[13px] text-[#6B6170]">+THB {CHILD_SEAT_THB.toLocaleString()} each</span></span>
              <Stepper value={a.childSeats} set={(n) => set("childSeats", n)} min={0} max={Math.min(4, a.passengers)} label="child seats" />
            </li>
            <li>
              <label className="flex cursor-pointer items-center gap-3 py-3">
                <Image src="/addon-currency-exchange.webp" alt="" width={44} height={44} unoptimized className="size-11 object-contain" />
                <span className="flex-1"><span className="block font-medium">Currency exchange stop</span><span className="text-[13px] text-[#6B6170]">+THB {EXCHANGE_STOP_THB.toLocaleString()}</span></span>
                <input type="checkbox" checked={a.exchangeStop} onChange={(e) => set("exchangeStop", e.target.checked)} className="size-5 accent-[#FF8A05]" />
              </label>
            </li>
          </ul>
        </>}

        {error && <p role="alert" className="mt-5 inline-flex rounded-lg bg-[#FFE9E6] px-3 py-1.5 text-[15px] font-medium text-[#C62828]">{error}</p>}

        <div className="mt-8 flex items-center gap-3">
          <button type="button" onClick={() => void next()} disabled={busy} className="inline-flex h-12 items-center gap-2 rounded-xl bg-[#FF8A05] px-6 text-[18px] font-semibold text-white shadow-sm hover:bg-[#E67900] disabled:opacity-60">
            {busy ? <LoaderCircle size={20} className="animate-spin" /> : null}
            {index === steps.length - 1 ? "Submit" : "OK"}{index < steps.length - 1 && <Check size={20} strokeWidth={3} />}
          </button>
          {index < steps.length - 1 && <span className="hidden text-[13px] text-[#9A8F86] sm:inline">press <b>Enter ↵</b></span>}
        </div>
      </div>
    </section>

    <nav className="fixed bottom-5 right-5 flex overflow-hidden rounded-lg shadow-md" aria-label="Move between questions">
      <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous question" className="grid size-10 place-items-center border-r border-white/30 bg-[#FF8A05] text-white disabled:opacity-50"><ChevronUp size={22} /></button>
      <button type="button" onClick={() => void next()} disabled={index === steps.length - 1 || busy} aria-label="Next question" className="grid size-10 place-items-center bg-[#FF8A05] text-white disabled:opacity-50"><ChevronDown size={22} /></button>
    </nav>
  </main>;
}
