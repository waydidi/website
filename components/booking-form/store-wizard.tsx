"use client";

import { DateField } from "@/components/booking-form/date-field";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { ArrowLeft, Banknote, Check, CreditCard, Luggage, Store, UsersRound } from "lucide-react";
import Image from "next/image";
import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { smallInput, smallLabel, Stepper, TimeSelect, today } from "@/components/booking-form/form-wizard";
import { PhoneInput } from "@/components/booking-form/phone-input";
import { PlaceInput, resolvePlaceId } from "@/components/booking-form/place-input";
import { CHILD_SEAT_THB, EXCHANGE_STOP_THB, FERRY_HOTEL_THB } from "@/lib/addons";
import { isAirportPickup } from "@/lib/trip-rules";
import { smallestFittingVehicle, VEHICLES, vehicleFits, type VehicleId } from "@/lib/vehicles";

type Quote = { quoteId: string; prices: Partial<Record<VehicleId, { total: number }>>; hotelTransfer: boolean };
type StepId = "name" | "phone" | "email" | "trip" | "return" | "ride" | "review";
const STEPS: StepId[] = ["name", "trip", "return", "ride", "review"];
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;
const heading = "text-[27px] font-bold leading-tight tracking-[-.01em] sm:text-[32px]";

async function quote(pickupPlaceId: string, dropoffPlaceId: string, date: string, time: string): Promise<Quote> {
  const res = await fetch("/api/fare-quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pickupPlaceId, dropoffPlaceId, pickupDate: date, pickupTime: time, timezone: "Asia/Bangkok" }) });
  const out = await res.json().catch(() => ({})) as { quoteId?: string; prices?: Quote["prices"]; inclusions?: { hotelTransfer?: boolean }; error?: string; manualReview?: boolean };
  if (!res.ok || !out.quoteId || !out.prices) throw new Error(out.manualReview ? "This destination needs a custom quote. Please ask the staff at the counter." : out.error ?? "We couldn't price this trip. Please try again.");
  return { quoteId: out.quoteId, prices: out.prices, hotelTransfer: Boolean(out.inclusions?.hotelTransfer) };
}

// Storefront QR booking (/s/[slug]): the same step-by-step form, with live prices,
// the store's special price, and payment at the counter. Books through the normal checkout.
export function StoreWizard({ store, cardEnabled }: { store: { slug: string; name: string; discountPercent: number }; cardEnabled: boolean }) {
  // Extras appear once a car has been tapped.
  const [carPicked, setCarPicked] = useState(false);
  const [a, setA] = useState({
    name: "", phone: "", email: "", pickup: "", pickupId: null as string | null, dropoff: "", dropoffId: null as string | null, flight: "",
    date: "", time: "", returnTrip: null as boolean | null, returnDate: "", returnTime: "",
    passengers: 2, luggage: 2, vehicle: "economy_sedan" as VehicleId, childSeats: 0, exchangeStop: false, ferryPeople: 0,
    payment: "cash" as "cash" | "card", terms: false,
  });
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [outbound, setOutbound] = useState<Quote | null>(null);
  const [back, setBack] = useState<Quote | null>(null);
  const attemptId = useRef<string>("");
  const firstInput = useRef<HTMLInputElement>(null);
  const step = STEPS[index];
  const set = <K extends keyof typeof a>(k: K, v: (typeof a)[K]) => { setA((c) => ({ ...c, [k]: v })); setError(""); };
  const airport = isAirportPickup({ pickup: a.pickup, flightNumber: null });

  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) return;
    const t = setTimeout(() => firstInput.current?.focus({ preventScroll: true }), 250);
    return () => clearTimeout(t);
  }, [step]);

  // Fare for each car: outbound + return, then the store's special price.
  const fareFor = (v: VehicleId) => {
    const o = outbound?.prices[v]?.total;
    if (o == null) return null;
    const r = a.returnTrip ? back?.prices[v]?.total : 0;
    if (r == null) return null;
    const full = o + r;
    const off = Math.min(full, Math.round((full * store.discountPercent) / 100));
    return { full, off, price: full - off };
  };
  const ferry = Boolean(outbound?.hotelTransfer);
  const addons = a.childSeats * CHILD_SEAT_THB + (a.exchangeStop ? EXCHANGE_STOP_THB : 0) + (ferry ? Math.min(a.ferryPeople, a.passengers) * FERRY_HOTEL_THB : 0);
  const chosen = fareFor(a.vehicle);

  function go(to: number) { setDirection(to > index ? 1 : -1); setError(""); setIndex(Math.max(0, Math.min(STEPS.length - 1, to))); }

  async function next() {
    if (busy) return;
    setError("");
    try {
      if (step === "name" && a.name.trim().length < 2) throw new Error("Please type your full name.");
      if (step === "name" && a.phone.replace(/\D/g, "").length < 7) throw new Error("Please add your WhatsApp number.");
      if (step === "name" && !/^\S+@\S+\.\S+$/.test(a.email.trim())) throw new Error("Please check your email address.");
      if (step === "trip") {
        if (a.pickup.trim().length < 2) throw new Error("Where should we pick you up?");
        if (a.dropoff.trim().length < 2) throw new Error("Where are you going?");
        if (!a.date || !a.time) throw new Error("Please choose the pickup date and time.");
        setBusy(true);
        // Typed without picking a suggestion: use Google's best match for the text.
        const pickupId = a.pickupId ?? await resolvePlaceId(a.pickup);
        const dropoffId = a.dropoffId ?? await resolvePlaceId(a.dropoff);
        if (!pickupId) throw new Error("We couldn't find that pickup. Please check the address.");
        if (!dropoffId) throw new Error("We couldn't find that destination. Please check the address.");
        setA((c) => ({ ...c, pickupId, dropoffId }));
        const q = await quote(pickupId, dropoffId, a.date, a.time);
        setOutbound(q);
        setA((c) => ({ ...c, vehicle: vehicleFits(c.vehicle, c.passengers, c.luggage) && q.prices[c.vehicle] ? c.vehicle : (Object.keys(q.prices)[0] as VehicleId) ?? c.vehicle }));
      }
      if (step === "return") {
        if (a.returnTrip === null) throw new Error("Please choose Yes or No.");
        if (a.returnTrip) {
          if (!a.returnDate || !a.returnTime) throw new Error("Please choose the return date and time.");
          if (`${a.returnDate}T${a.returnTime}` <= `${a.date}T${a.time}`) throw new Error("The return must be after your first pickup.");
          setBusy(true);
          setBack(await quote((a.dropoffId ?? await resolvePlaceId(a.dropoff))!, (a.pickupId ?? await resolvePlaceId(a.pickup))!, a.returnDate, a.returnTime));
        } else setBack(null);
      }
      if (step === "ride" && (!carPicked || !fareFor(a.vehicle))) throw new Error("Please choose a car.");
      if (step !== "review") { go(index + 1); return; }

      if (!a.terms) throw new Error("Please accept the booking terms.");
      setBusy(true);
      attemptId.current ||= crypto.randomUUID();
      const words = a.name.trim().split(/\s+/);
      const res = await fetch("/api/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        checkoutAttemptId: attemptId.current,
        customerName: words.length > 1 ? words.slice(0, -1).join(" ") : a.name.trim(), customerSurname: words.length > 1 ? words[words.length - 1] : "-",
        customerEmail: a.email.trim(), customerPhone: a.phone.trim(),
        pickup: a.pickup, dropoff: a.dropoff, pickupDate: a.date, pickupTime: a.time, timezone: "Asia/Bangkok",
        passengers: Math.min(10, a.passengers), luggage: Math.min(12, a.luggage), vehicle: a.vehicle,
        flightNumber: airport ? a.flight : "", childSeats: a.childSeats, exchangeStop: a.exchangeStop, ferryHotelPeople: ferry ? a.ferryPeople : 0,
        oversizedLuggage: false, termsAccepted: true, paymentMethod: a.payment, serviceType: "transfer",
        fareQuoteId: outbound!.quoteId,
        ...(a.returnTrip && back ? { returnFareQuoteId: back.quoteId, returnDate: a.returnDate, returnTime: a.returnTime } : {}),
        source: `store:${store.slug}`,
      }) });
      const out = await res.json().catch(() => ({})) as { checkoutUrl?: string; error?: string };
      if (!res.ok || !out.checkoutUrl) throw new Error(out.error ?? "The booking could not be completed. Please ask the staff for help.");
      window.location.assign(out.checkoutUrl);
      return;
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  function setGroup(passengers: number, luggage: number) {
    setA((c) => ({ ...c, passengers, luggage, vehicle: vehicleFits(c.vehicle, passengers, luggage) ? c.vehicle : smallestFittingVehicle(passengers, luggage) ?? "premium_minivan" }));
  }

  const last = step === "review";

  return <main className="flex min-h-dvh flex-col bg-white text-[#1F1726]" onKeyDown={(e) => {
    if (e.key === "Enter" && !(e.target instanceof HTMLButtonElement) && !(e.target instanceof Element && e.target.closest("[role=dialog]"))) { e.preventDefault(); void next(); }
  }}>
    <header className="sticky top-0 z-20 bg-[#FF8A05] pb-3 text-white">
      <div className="mx-auto flex h-16 w-full max-w-xl items-center gap-2 px-5">
        <WaydidiLogo className="mr-auto h-11 w-auto text-white" />
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[15px] font-medium text-white transition hover:bg-white/15 disabled:invisible"><ArrowLeft size={18} />Back</button>
        <span className="text-[14px] font-semibold text-white/85">Step <span className="text-white">{index + 1}</span> of {STEPS.length}</span>
      </div>
      <div className="mx-auto h-1.5 w-full max-w-xl px-5"><div className="h-full overflow-hidden rounded-full bg-white/30"><div className="h-full rounded-full bg-white transition-[width] duration-500 ease-out" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} /></div></div>
    </header>

    <section className="flex flex-1 items-start px-5 pb-36 pt-6 sm:items-center sm:pb-24">
      <div key={step} className={`mx-auto w-full max-w-xl animate-in fade-in duration-300 ease-out motion-reduce:animate-none ${direction === 1 ? "slide-in-from-right-6" : "slide-in-from-left-6"}`}>
        {index === 0 && <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#FFF0DF] px-3 py-1.5 text-[14px] font-semibold text-[#B85E00]"><Store size={16} />{store.name}{store.discountPercent > 0 ? ` · ${store.discountPercent}% off special price` : ""}</p>}

        {step === "name" && <>
          <h1 className={heading}>What&apos;s your name?</h1>
          <p className="mt-2 text-[17px] text-[#6B6170]">The lead passenger&apos;s details, so your driver can greet and message you.</p>
          <div className="mt-7 grid gap-4">
            <label className={smallLabel}>Full name<input ref={firstInput} className={smallInput} value={a.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Anna Smith" autoComplete="name" /></label>
            <div className={smallLabel}>WhatsApp<div className="mt-1.5"><PhoneInput value={a.phone} onChange={(v) => set("phone", v)} className={`${smallInput} mt-0 min-w-0 flex-1`} /></div></div>
            <label className={smallLabel}>Email<input type="email" inputMode="email" className={smallInput} value={a.email} onChange={(e) => set("email", e.target.value)} placeholder="name@example.com" autoComplete="email" /></label>
          </div>
        </>}
        {step === "trip" && <>
          <h1 className={heading}>Where are you going?</h1>
          <div className="mt-7 grid gap-6">
            <label className={smallLabel}>Pickup location<PlaceInput inputRef={firstInput} className={smallInput} value={a.pickup} onChange={(v) => set("pickup", v)} onPlace={(id) => set("pickupId", id)} placeholder="Airport, hotel name or address" /></label>
            {airport && <label className={`${smallLabel} animate-in fade-in`}>Flight number <span className="font-normal text-[#9A8F86]">(optional)</span><input className={smallInput} value={a.flight} onChange={(e) => set("flight", e.target.value.toUpperCase())} placeholder="TG 123" /></label>}
            <label className={smallLabel}>Destination<PlaceInput className={smallInput} value={a.dropoff} onChange={(v) => set("dropoff", v)} onPlace={(id) => set("dropoffId", id)} placeholder="Hotel name or address" /></label>
            <div className="grid grid-cols-2 gap-5">
              <div className={smallLabel}>Pickup date<DateField min={today()} className={smallInput} value={a.date} onChange={(v) => set("date", v)} time={a.time} onTimeChange={(v) => set("time", v)} /></div>
              <label className={smallLabel}>Pickup time<TimeSelect className={smallInput} value={a.time} onChange={(v) => set("time", v)} /></label>
            </div>
          </div>
        </>}
        {step === "return" && <>
          <h1 className={heading}>Do you need a return trip?</h1>
          <p className="mt-2 text-[17px] text-[#6B6170]">From {a.dropoff || "your destination"} back to {a.pickup || "your pickup"}.</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            {([[true, "Yes, add a return"], [false, "No, one way"]] as const).map(([value, text]) => <button key={text} type="button" onClick={() => set("returnTrip", value)} className={`flex h-16 items-center gap-3 rounded-2xl border-2 px-4 text-left text-[17px] font-semibold transition ${a.returnTrip === value ? "border-[#FF8A05] bg-[#FFF0DF]" : "border-[#F0E3D4] bg-white"}`}>{text}{a.returnTrip === value && <Check size={20} className="ml-auto text-[#FF8A05]" />}</button>)}
          </div>
          {a.returnTrip && <div className="mt-7 grid grid-cols-2 gap-5 animate-in fade-in">
            <div className={smallLabel}>Return date<DateField kind="return" min={a.date || today()} className={smallInput} value={a.returnDate} onChange={(v) => set("returnDate", v)} time={a.returnTime} onTimeChange={(v) => set("returnTime", v)} /></div>
            <label className={smallLabel}>Return time<TimeSelect className={smallInput} value={a.returnTime} onChange={(v) => set("returnTime", v)} /></label>
          </div>}
        </>}
        {step === "ride" && <>
          <h1 className={heading}>Choose your car</h1>
          {store.discountPercent > 0 && <p className="mt-2 text-[16px] font-medium text-[#15803D]">{store.name} special price: {store.discountPercent}% off already applied.</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-8 gap-y-4 rounded-2xl border border-[#F0E3D4] bg-white px-5 py-4">
            <span className="flex items-center gap-3"><UsersRound size={24} aria-label="Passengers" /><Stepper value={a.passengers} set={(n) => setGroup(n, a.luggage)} min={1} max={10} label="passengers" /></span>
            <span className="flex items-center gap-3"><Luggage size={24} aria-label="Bags" /><Stepper value={a.luggage} set={(n) => setGroup(a.passengers, n)} min={0} max={12} label="bags" /></span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {(Object.keys(VEHICLES) as VehicleId[]).map((id) => {
              const fare = fareFor(id);
              const fits = vehicleFits(id, a.passengers, a.luggage) && Boolean(fare);
              const picked = a.vehicle === id;
              return <button key={id} type="button" disabled={!fits} onClick={() => { set("vehicle", id); setCarPicked(true); }} className={`relative rounded-2xl border-2 p-3 text-left transition disabled:opacity-35 ${picked && carPicked ? "border-[#FF8A05] bg-[#FFF7EE]" : "border-[#F0E3D4] bg-white"}`}>
                <Image src={`/vehicle-${id.replace(/_/g, "-")}.webp`} alt="" width={200} height={110} unoptimized className="h-16 w-full object-contain" />
                <span className="mt-1 block text-[15px] font-semibold">{VEHICLES[id].name}</span>
                <span className="block text-[13px] text-[#6B6170]">Up to {VEHICLES[id].passengers} people · {VEHICLES[id].bags} bags</span>
                {fare && <span className="mt-1 block"><b className="text-[17px]">{thb(fare.price)}</b>{fare.off > 0 && <s className="ml-1.5 text-[13px] text-[#9A8F86]">{thb(fare.full)}</s>}</span>}
                {picked && carPicked && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-[#FF8A05] text-white"><Check size={15} strokeWidth={3} /></span>}
              </button>;
            })}
          </div>
          {carPicked && <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
          <p className="mt-6 text-[16px] font-semibold">Extras <span className="font-normal text-[#9A8F86]">(optional)</span></p>
          <ul className="mt-2 divide-y divide-[#F0E3D4] rounded-2xl border border-[#F0E3D4] bg-white px-4">
            {ferry && <li className="flex items-center gap-3 py-3"><Image src="/ferry-3d.webp" alt="" width={44} height={44} unoptimized className="size-11 object-contain" /><span className="flex-1"><span className="block font-medium">Ferry &amp; Hotel transfer</span><span className="text-[13px] text-[#6B6170]">+{thb(FERRY_HOTEL_THB)} per person</span></span><Stepper value={a.ferryPeople} set={(n) => set("ferryPeople", n)} min={0} max={a.passengers} label="ferry tickets" /></li>}
            <li className="flex items-center gap-3 py-3"><Image src="/addon-child-seat.webp" alt="" width={44} height={44} unoptimized className="size-11 object-contain" /><span className="flex-1"><span className="block font-medium">Child seat</span><span className="text-[13px] text-[#6B6170]">+{thb(CHILD_SEAT_THB)} each</span></span><Stepper value={a.childSeats} set={(n) => set("childSeats", n)} min={0} max={Math.min(4, a.passengers)} label="child seats" /></li>
            <li><label className="flex cursor-pointer items-center gap-3 py-3"><Image src="/addon-currency-exchange.webp" alt="" width={44} height={44} unoptimized className="size-11 object-contain" /><span className="flex-1"><span className="block font-medium">Currency exchange stop</span><span className="text-[13px] text-[#6B6170]">+{thb(EXCHANGE_STOP_THB)}</span></span><input type="checkbox" checked={a.exchangeStop} onChange={(e) => set("exchangeStop", e.target.checked)} className="size-5 accent-[#FF8A05]" /></label></li>
          </ul>
          </div>}
        </>}
        {step === "review" && chosen && <>
          <h1 className={heading}>Check and pay</h1>
          <dl className="mt-6 divide-y divide-[#F0E3D4] rounded-2xl border border-[#F0E3D4] bg-white text-[15px]">
            {[["Name", a.name], ["WhatsApp", a.phone], ["From", a.pickup], ["To", a.dropoff], ["Pickup", `${a.date} at ${a.time}`], ...(a.returnTrip ? [["Return", `${a.returnDate} at ${a.returnTime}`]] : []), ["Car", `${VEHICLES[a.vehicle].name} · ${a.passengers} passengers · ${a.luggage} bags`]].map(([k, v]) =>
              <div key={k} className="flex gap-3 px-4 py-2.5"><dt className="w-24 shrink-0 text-[#9A8F86]">{k}</dt><dd className="min-w-0 flex-1 break-words font-medium">{v}</dd></div>)}
          </dl>
          <div className="mt-4 grid gap-1.5 rounded-2xl bg-white p-4 text-[15px] ring-1 ring-[#F0E3D4]">
            <p className="flex justify-between"><span>Fare</span><span>{thb(chosen.full)}</span></p>
            {chosen.off > 0 && <p className="flex justify-between font-semibold text-[#15803D]"><span>{store.name} special price ({store.discountPercent}%)</span><span>−{thb(chosen.off)}</span></p>}
            {addons > 0 && <p className="flex justify-between"><span>Extras</span><span>+{thb(addons)}</span></p>}
            <p className="mt-1 flex justify-between border-t border-[#F0E3D4] pt-2 text-[20px] font-bold"><span>Total</span><span>{thb(chosen.price + addons)}</span></p>
          </div>
          <p className="mt-6 text-[16px] font-semibold">How would you like to pay?</p>
          <div className="mt-2 grid gap-3">
            <button type="button" onClick={() => set("payment", "cash")} className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left ${a.payment === "cash" ? "border-[#FF8A05] bg-[#FFF0DF]" : "border-[#F0E3D4] bg-white"}`}><Banknote className="text-[#FF8A05]" /><span className="flex-1"><b className="block">Cash at the counter</b><span className="text-[14px] text-[#6B6170]">Pay the staff at {store.name} now</span></span>{a.payment === "cash" && <Check className="text-[#FF8A05]" />}</button>
            <button type="button" disabled={!cardEnabled} onClick={() => set("payment", "card")} className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left disabled:opacity-45 ${a.payment === "card" ? "border-[#FF8A05] bg-[#FFF0DF]" : "border-[#F0E3D4] bg-white"}`}><CreditCard className="text-[#FF8A05]" /><span className="flex-1"><b className="block">Credit or debit card</b><span className="text-[14px] text-[#6B6170]">{cardEnabled ? "Secure online payment" : "Coming soon"}</span></span>{a.payment === "card" && <Check className="text-[#FF8A05]" />}</button>
          </div>
          <label className="mt-5 flex items-start gap-3 text-[15px]"><input type="checkbox" checked={a.terms} onChange={(e) => set("terms", e.target.checked)} className="mt-1 size-5 accent-[#FF8A05]" /><span>I agree to the <a href="/terms" target="_blank" className="font-semibold text-[#D96F00] underline">booking terms</a> and <a href="/cancellation-refund-policy" target="_blank" className="font-semibold text-[#D96F00] underline">cancellation policy</a>.</span></label>
        </>}

        {error && <p key={error} role="alert" className="mt-5 flex items-center gap-2 rounded-xl bg-[#FFE9E6] px-4 py-2.5 text-[15px] font-medium text-[#B42318]"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-[#B42318] text-[12px] font-bold text-white">!</span>{error}</p>}
        <div className="mt-8 hidden sm:block">
          <button type="button" onClick={() => void next()} disabled={busy} className="inline-flex h-14 items-center gap-2 rounded-2xl bg-[#FF8A05] px-8 text-[18px] font-semibold text-white shadow-[0_8px_20px_-6px_rgba(255,138,5,.7)] hover:bg-[#E67900] disabled:opacity-60">{busy && <LoaderCircle size={20} className="animate-spin" />}{last ? `Book now${chosen ? ` · ${thb(chosen.price + addons)}` : ""}` : "Continue"}</button>
        </div>
      </div>
    </section>
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#F0E3D4] bg-white/95 px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 backdrop-blur sm:hidden">
      <button type="button" onClick={() => void next()} disabled={busy} className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#FF8A05] text-[18px] font-semibold text-white disabled:opacity-60">{busy && <LoaderCircle size={20} className="animate-spin" />}{last ? `Book now${chosen ? ` · ${thb(chosen.price + addons)}` : ""}` : "Continue"}</button>
    </div>
  </main>;
}
