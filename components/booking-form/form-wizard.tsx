"use client";

import { ArrowLeft, CarFront, Check, ClipboardCheck, Lock, LoaderCircle, Luggage, Mail, MapPin, MessageCircle, Minus, Pencil, Plus, Repeat, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CHILD_SEAT_THB, EXCHANGE_STOP_THB, FERRY_HOTEL_THB } from "@/lib/addons";
import { offersFerry, type FormPrefill, type FormService } from "@/lib/booking-form";
import { PhoneInput } from "@/components/booking-form/phone-input";
import { PlaceInput } from "@/components/booking-form/place-input";
import { isAirportPickup } from "@/lib/trip-rules";
import { smallestFittingVehicle, VEHICLES, vehicleFits, type VehicleId } from "@/lib/vehicles";

type Answers = {
  name: string; phone: string; email: string;
  pickup: string; flightNumber: string; dropoff: string; hours: number; date: string; time: string;
  returnTrip: boolean | null; returnDate: string; returnTime: string;
  passengers: number; luggage: number; vehicle: VehicleId; childSeats: number; exchangeStop: boolean; ferryPeople: number;
};
type StepId = "name" | "phone" | "email" | "trip" | "return" | "ride" | "review";

const blank: Answers = {
  name: "", phone: "", email: "", pickup: "", flightNumber: "", dropoff: "", hours: 4, date: "", time: "",
  returnTrip: null, returnDate: "", returnTime: "",
  passengers: 2, luggage: 2, vehicle: "economy_sedan", childSeats: 0, exchangeStop: false, ferryPeople: 0,
};

const box = "w-full rounded-2xl border-2 font-normal border-[#F0E3D4] bg-white px-4 text-[#1F1726] shadow-[0_1px_2px_rgba(60,30,0,.04)] outline-none transition placeholder:text-[#BDB2A8] focus:border-[#FF8A05] focus:ring-4 focus:ring-[#FF8A05]/15 disabled:bg-[#FAF6F1] disabled:text-[#6B6170]";
const bigInput = `${box} h-16 text-[20px] sm:text-[22px]`;
const smallLabel = "block text-[14px] font-semibold text-[#4A3F4F]";
const smallInput = `${box} mt-1.5 h-14 text-[17px]`;

// Round icon badge above each question.
const STEP_ICON: Record<string, LucideIcon> = { name: UserRound, phone: MessageCircle, email: Mail, trip: MapPin, return: Repeat, ride: CarFront, review: ClipboardCheck };
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

function Stepper({ value, set, min, max, label }: { value: number; set: (n: number) => void; min: number; max: number; label: string }) {
  return <span className="flex items-center gap-3">
    <button type="button" aria-label={`Fewer ${label}`} disabled={value <= min} onClick={() => set(value - 1)} className="grid size-10 place-items-center rounded-full border-2 border-[#F0E3D4] bg-white text-[#1F1726] transition active:scale-90 enabled:hover:border-[#FF8A05] disabled:opacity-35"><Minus size={18} /></button>
    <span className="w-6 text-center text-[20px] font-semibold tabular-nums" aria-live="polite">{value}</span>
    <button type="button" aria-label={`More ${label}`} disabled={value >= max} onClick={() => set(value + 1)} className="grid size-10 place-items-center rounded-full border-2 border-[#FF8A05] bg-[#FF8A05] text-white transition active:scale-90 enabled:hover:bg-[#E67900] disabled:border-[#F0E3D4] disabled:bg-white disabled:text-[#1F1726] disabled:opacity-35"><Plus size={18} /></button>
  </span>;
}

// Typeform-style booking form: one step per screen, Enter to continue, progress saved on the device.
export function FormWizard({ token, service, prefill = {} }: { token: string; service: FormService; prefill?: FormPrefill }) {
  const locked = (k: keyof FormPrefill) => prefill[k] !== undefined;
  const withPrefill = (x: Answers): Answers => ({
    ...x,
    ...(prefill.pickup ? { pickup: prefill.pickup } : {}), ...(prefill.dropoff ? { dropoff: prefill.dropoff } : {}),
    ...(prefill.hours ? { hours: prefill.hours } : {}), ...(prefill.date ? { date: prefill.date } : {}),
    ...(prefill.time ? { time: prefill.time } : {}), ...(prefill.vehicle ? { vehicle: prefill.vehicle as VehicleId } : {}),
  });
  const storageKey = `waydidi-form-${token}`;
  const [a, setA] = useState<Answers>(() => withPrefill(blank));
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
      if (saved?.a) { setA(withPrefill({ ...blank, ...saved.a })); setIndex(saved.index ?? 0); }
    } catch { /* storage blocked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restore once per link
  }, [storageKey]);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify({ a, index })); } catch { /* storage blocked */ } }, [a, index, storageKey]);

  const tripLocked = locked("pickup") && (service === "hourly" ? locked("hours") : locked("dropoff")) && locked("date") && locked("time");
  const steps: StepId[] = ["name", "phone", "email", ...(tripLocked ? [] : ["trip" as const]), ...(service === "transfer" ? ["return" as const] : []), "ride", "review"];
  const step = steps[Math.min(index, steps.length - 1)];
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => { setA((c) => ({ ...c, [k]: v })); setError(""); };
  const airport = isAirportPickup({ pickup: a.pickup, flightNumber: null });
  const ferry = service !== "hourly" && offersFerry(a.pickup, a.dropoff);
  const firstName = a.name.trim().split(/\s+/)[0] ?? "";

  // Focus the first box after the slide-in (not on phones, where the keyboard would cover the question).
  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) return;
    const t = setTimeout(() => firstInput.current?.focus({ preventScroll: true }), 250);
    return () => clearTimeout(t);
  }, [step]);

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
    setA((c) => ({ ...c, passengers, luggage, vehicle: locked("vehicle") || vehicleFits(c.vehicle, passengers, luggage) ? c.vehicle : smallestFittingVehicle(passengers, luggage) ?? "premium_minivan" }));
  }

  if (sent) return <main className="grid min-h-dvh place-items-center bg-[#FF8A05] px-6 text-white">
    <div className="max-w-md text-center animate-in fade-in zoom-in-95 duration-500">
      <Image src="/waydidi-logo.png" alt="Waydidi" width={180} height={68} className="mx-auto mb-8 h-auto w-40" />
      <span className="mx-auto mb-5 grid size-16 place-items-center rounded-full bg-white text-[#FF8A05]"><Check size={34} strokeWidth={3} /></span>
      <h1 className="text-[32px] font-bold leading-tight">Thank you{firstName ? `, ${firstName}` : ""}!</h1>
      <p className="mt-3 text-[17px] text-white/90">We&apos;ve got your details. Here&apos;s what happens next:</p>
      <ol className="mx-auto mt-6 grid max-w-sm gap-3 text-left">
        {["We check the car and driver for your date", "We confirm on WhatsApp and email, with your booking PDF", "Your driver's details arrive before pickup"].map((t, i) =>
          <li key={t} className="flex items-start gap-3 rounded-2xl bg-white/15 px-4 py-3 text-[15px] animate-in fade-in slide-in-from-bottom-2 fill-mode-both motion-reduce:animate-none" style={{ animationDelay: `${300 + i * 150}ms` }}>
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-white text-[13px] font-bold text-[#FF8A05]">{i + 1}</span>{t}
          </li>)}
      </ol>
    </div>
  </main>;

  const progress = Math.round(((index + 1) / steps.length) * 100);
  const number = index + 1;
  const Icon = STEP_ICON[step];
  const last = index === steps.length - 1;

  return <main className="flex min-h-dvh flex-col bg-[#FFFBF6] text-[#1F1726]" onKeyDown={(e) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLTextAreaElement) && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); void next(); }
  }}>
    <header className="sticky top-0 z-20 bg-[#FFFBF6]/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-xl items-center justify-between px-5">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="-ml-2 inline-flex disabled:invisible h-10 items-center gap-1.5 rounded-full px-3 text-[15px] font-medium text-[#6B6170] transition hover:bg-[#FFF0DF] hover:text-[#1F1726]"><ArrowLeft size={18} />Back</button>
        <span className="text-[14px] font-semibold text-[#9A8F86]">Step <span className="text-[#FF8A05]">{number}</span> of {steps.length}</span>
      </div>
      <div className="mx-auto h-1.5 w-full max-w-xl px-5"><div className="h-full overflow-hidden rounded-full bg-[#FFE7CC]"><div className="h-full rounded-full bg-[#FF8A05] transition-[width] duration-500 ease-out" style={{ width: `${progress}%` }} /></div></div>
    </header>

    <section className="flex flex-1 items-start px-5 pb-36 pt-8 sm:items-center sm:pb-24">
      <div key={step} className={`mx-auto w-full max-w-xl animate-in fade-in duration-300 ease-out motion-reduce:animate-none ${direction === 1 ? "slide-in-from-right-6" : "slide-in-from-left-6"}`}>
        {Icon && <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-[#FFF0DF] text-[#FF8A05]"><Icon size={24} strokeWidth={2.2} /></span>}

        {step === "name" && <>
          <h1 className="text-[27px] font-bold leading-tight tracking-[-.01em] sm:text-[32px]">What&apos;s your name?</h1>
          <p className="mt-2 text-[17px] text-[#6B6170]">The lead passenger&apos;s full name, so your driver can greet you.</p>
          <input ref={firstInput} className={`${bigInput} mt-8`} value={a.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Anna Smith" autoComplete="name" />
        </>}

        {step === "phone" && <>
          <h1 className="text-[27px] font-bold leading-tight tracking-[-.01em] sm:text-[32px]">{firstName ? `Thanks ${firstName}! ` : ""}What&apos;s your WhatsApp number?</h1>
          <p className="mt-2 text-[17px] text-[#6B6170]">Choose your country code, then your number. Your driver will message you here.</p>
          <div className="mt-8"><PhoneInput inputRef={firstInput} value={a.phone} onChange={(v) => set("phone", v)} className={`${bigInput} min-w-0 flex-1`} /></div>
        </>}

        {step === "email" && <>
          <h1 className="text-[27px] font-bold leading-tight tracking-[-.01em] sm:text-[32px]">And your email?</h1>
          <p className="mt-2 text-[17px] text-[#6B6170]">We&apos;ll send your booking confirmation here.</p>
          <input ref={firstInput} type="email" inputMode="email" className={`${bigInput} mt-8`} value={a.email} onChange={(e) => set("email", e.target.value)} placeholder="name@example.com" autoComplete="email" />
        </>}

        {step === "trip" && <>
          <h1 className="text-[27px] font-bold leading-tight tracking-[-.01em] sm:text-[32px]">{service === "hourly" ? "Tell us about your day" : service === "tour" ? "Tell us about your tour" : "Tell us about your trip"}</h1>
          <div className="mt-7 grid gap-6">
            <label className={smallLabel}>Pickup location{locked("pickup") && <Lock size={13} className="ml-1 inline text-[#9A8F86]" />}<PlaceInput inputRef={firstInput} className={smallInput} value={a.pickup} onChange={(v) => set("pickup", v)} placeholder="Airport, hotel name or address" disabled={locked("pickup")} /></label>
            {airport && <label className={`${smallLabel} animate-in fade-in slide-in-from-top-2`}>Flight number <span className="font-normal text-[#9A8F86]">(optional)</span><input className={smallInput} value={a.flightNumber} onChange={(e) => set("flightNumber", e.target.value.toUpperCase())} placeholder="TG 123" /></label>}
            {service === "hourly"
              ? <div className={smallLabel}>How many hours?<div className="mt-2">{locked("hours") ? <span className="text-[19px] text-[#1F1726]">{a.hours} hours</span> : <Stepper value={a.hours} set={(n) => set("hours", n)} min={1} max={24} label="hours" />}</div></div>
              : <label className={smallLabel}>{service === "tour" ? "Which tour?" : "Where are you going?"}{locked("dropoff") && <Lock size={13} className="ml-1 inline text-[#9A8F86]" />}
                {service === "tour"
                  ? <input className={smallInput} value={a.dropoff} onChange={(e) => set("dropoff", e.target.value)} placeholder="e.g. Floating market day trip" disabled={locked("dropoff")} />
                  : <PlaceInput className={smallInput} value={a.dropoff} onChange={(v) => set("dropoff", v)} placeholder="Hotel name or address" disabled={locked("dropoff")} />}</label>}
            <div className="grid grid-cols-2 gap-5">
              <label className={smallLabel}>Pickup date<input type="date" min={today()} className={smallInput} value={a.date} onChange={(e) => set("date", e.target.value)} disabled={locked("date")} /></label>
              <label className={smallLabel}>Pickup time<input type="time" className={smallInput} value={a.time} onChange={(e) => set("time", e.target.value)} disabled={locked("time")} /></label>
            </div>
          </div>
        </>}

        {step === "return" && <>
          <h1 className="text-[27px] font-bold leading-tight tracking-[-.01em] sm:text-[32px]">Do you need a return trip?</h1>
          <p className="mt-2 text-[17px] text-[#6B6170]">From {a.dropoff || "your drop-off"} back to {a.pickup || "your pickup"}.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {([[true, "A", "Yes, add a return"], [false, "B", "No, one way"]] as const).map(([value, key, text]) => <button key={key} type="button" onClick={() => set("returnTrip", value)} className={`flex h-16 items-center gap-3 rounded-2xl border-2 px-4 text-left text-[17px] font-semibold transition active:scale-[.98] ${a.returnTrip === value ? "border-[#FF8A05] bg-[#FFF0DF]" : "border-[#F0E3D4] bg-white hover:border-[#FFC98A]"}`}>
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
          <h1 className="text-[27px] font-bold leading-tight tracking-[-.01em] sm:text-[32px]">Your ride</h1>
          <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border border-[#F0E3D4] bg-white px-5 py-4">
            <span className="flex items-center gap-3"><UsersRound size={24} aria-label="Passengers" /><Stepper value={a.passengers} set={(n) => setGroup(n, a.luggage)} min={1} max={20} label="passengers" /></span>
            <span className="flex items-center gap-3"><Luggage size={24} aria-label="Bags" /><Stepper value={a.luggage} set={(n) => setGroup(a.passengers, n)} min={0} max={30} label="bags" /></span>
          </div>

          <p className="mt-7 text-[16px] font-semibold">Choose your car</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(Object.keys(VEHICLES) as VehicleId[]).filter((id) => !locked("vehicle") || id === a.vehicle).map((id) => {
              const v = VEHICLES[id];
              const fits = locked("vehicle") || vehicleFits(id, a.passengers, a.luggage);
              const chosen = a.vehicle === id;
              return <button key={id} type="button" disabled={!fits} onClick={() => set("vehicle", id)} className={`relative rounded-2xl border-2 p-3 text-left transition active:scale-[.98] disabled:opacity-35 ${chosen ? "border-[#FF8A05] bg-[#FFF7EE] shadow-[0_6px_16px_-8px_rgba(255,138,5,.6)]" : "border-[#F0E3D4] bg-white hover:border-[#FFC98A]"}`}>
                <Image src={`/vehicle-${id.replace(/_/g, "-")}.webp`} alt="" width={200} height={110} unoptimized className="h-16 w-full object-contain" />
                <span className="mt-1 block text-[15px] font-semibold">{v.name}</span>
                <span className="block text-[13px] text-[#6B6170]">Up to {v.passengers} people · {v.bags} bags</span>
                {chosen && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-[#FF8A05] text-white"><Check size={15} strokeWidth={3} /></span>}
              </button>;
            })}
          </div>

          <p className="mt-7 text-[16px] font-semibold">Extras <span className="font-normal text-[#9A8F86]">(optional)</span></p>
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

        {step === "review" && <>
          <h1 className="text-[27px] font-bold leading-tight tracking-[-.01em] sm:text-[32px]">Check your details</h1>
          <p className="mt-2 text-[17px] text-[#6B6170]">Tap a line to change it, then send.</p>
          <dl className="mt-6 divide-y divide-[#F0E3D4] rounded-2xl border border-[#F0E3D4] bg-white">
            {([
              ["Name", a.name, "name"], ["WhatsApp", a.phone, "phone"], ["Email", a.email, "email"],
              ["From", a.pickup, "trip"],
              service === "hourly" ? ["Hours", `${a.hours} hours`, "trip"] : [service === "tour" ? "Tour" : "To", a.dropoff, "trip"],
              ["Date & time", `${a.date} at ${a.time}`, "trip"],
              ...(airport && a.flightNumber ? [["Flight", a.flightNumber, "trip"]] : []),
              ...(service === "transfer" ? [["Return", a.returnTrip ? `${a.returnDate} at ${a.returnTime}` : "No", "return"]] : []),
              ["Passengers & bags", `${a.passengers} passengers · ${a.luggage} bags`, "ride"],
              ["Car", VEHICLES[a.vehicle].name, "ride"],
              ["Extras", [ferry && a.ferryPeople ? `Ferry & Hotel transfer × ${a.ferryPeople}` : "", a.childSeats ? `Child seat × ${a.childSeats}` : "", a.exchangeStop ? "Currency exchange stop" : ""].filter(Boolean).join(", ") || "None", "ride"],
            ] as [string, string, StepId][]).map(([k, v, target]) => {
              const at = steps.indexOf(target);
              return <div key={k}>
                <button type="button" disabled={at < 0} onClick={() => go(at)} className="flex w-full items-start gap-3 px-4 py-3 text-left enabled:hover:bg-[#FFF7EE]">
                  <dt className="w-32 shrink-0 text-[14px] text-[#9A8F86]">{k}</dt>
                  <dd className="min-w-0 flex-1 break-words text-[16px] font-medium">{v}</dd>
                  {at >= 0 ? <Pencil size={15} className="mt-1 shrink-0 text-[#FF8A05]" /> : <Lock size={15} className="mt-1 shrink-0 text-[#C9BFB5]" />}
                </button>
              </div>;
            })}
          </dl>
          {prefill.price !== undefined && <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#FFF0DF] px-4 py-3">
            <span className="text-[16px] font-semibold">Your agreed price</span>
            <span className="text-[20px] font-bold">THB {(prefill.price + a.childSeats * CHILD_SEAT_THB + (a.exchangeStop ? EXCHANGE_STOP_THB : 0) + (ferry ? a.ferryPeople * FERRY_HOTEL_THB : 0)).toLocaleString()}</span>
          </div>}
        </>}

        {error && <p key={error} role="alert" className="mt-5 flex items-center gap-2 rounded-xl bg-[#FFE9E6] px-4 py-2.5 text-[15px] font-medium text-[#B42318] animate-in fade-in slide-in-from-top-1 motion-reduce:animate-none"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#B42318] text-[12px] font-bold text-white">!</span>{error}</p>}

        <div className="mt-8 hidden items-center gap-3 sm:flex">
          <button type="button" onClick={() => void next()} disabled={busy} className="inline-flex h-14 items-center gap-2 rounded-2xl bg-[#FF8A05] px-8 text-[18px] font-semibold text-white shadow-[0_8px_20px_-6px_rgba(255,138,5,.7)] transition hover:bg-[#E67900] active:scale-[.98] disabled:opacity-60">
            {busy && <LoaderCircle size={20} className="animate-spin" />}{last ? "Send my details" : "Continue"}{!last && !busy && <Check size={20} strokeWidth={3} />}
          </button>
          {!last && <span className="text-[13px] text-[#9A8F86]">or press <b>Enter ↵</b></span>}
        </div>
      </div>
    </section>

    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#F0E3D4] bg-[#FFFBF6]/95 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:hidden">
      <button type="button" onClick={() => void next()} disabled={busy} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#FF8A05] text-[18px] font-semibold text-white shadow-[0_8px_20px_-6px_rgba(255,138,5,.7)] transition active:scale-[.98] disabled:opacity-60">
        {busy && <LoaderCircle size={20} className="animate-spin" />}{last ? "Send my details" : "Continue"}
      </button>
    </div>
  </main>;
}
