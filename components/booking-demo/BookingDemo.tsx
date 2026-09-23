"use client";

import {
  ArrowRight,
  Check,
  CheckCircle2,
  MapPin,
  Navigation,
  ShieldCheck,
  Wifi,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { WaydidiLogo } from "@/components/waydidi-logo";

type DemoStep = "trip" | "vehicle" | "fare" | "confirmation";

const steps: Array<{
  id: DemoStep;
  number: string;
  title: string;
  description: string;
  status: string;
}> = [
  {
    id: "trip",
    number: "01",
    title: "Enter your trip",
    description: "Choose pickup, destination, date, time, passengers and luggage.",
    status: "BKK Airport → Pattaya",
  },
  {
    id: "vehicle",
    number: "02",
    title: "Choose your ride",
    description: "Compare available Waydidi vehicle options.",
    status: "Comfort SUV selected",
  },
  {
    id: "fare",
    number: "03",
    title: "Review your fare",
    description: "See your journey and price before proceeding.",
    status: "Clear price before you book",
  },
  {
    id: "confirmation",
    number: "04",
    title: "Booking confirmed",
    description: "Your private Waydidi ride is ready.",
    status: "Your Waydidi ride is ready",
  },
];

const vehicles = [
  { name: "Economy Sedan", capacity: "Up to 3 passengers", price: "฿1,650" },
  { name: "Comfort SUV", capacity: "Up to 4 passengers", price: "฿2,200" },
  { name: "Premium Minivan", capacity: "Up to 9 passengers", price: "฿2,850" },
];

export function BookingDemo() {
  const sectionRef = useRef<HTMLElement>(null);
  const [step, setStep] = useState<DemoStep>("trip");
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const node = sectionRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.18),
      { threshold: [0, 0.18, 0.5] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || reducedMotion) return;
    const timer = window.setTimeout(() => {
      setStep((current) => {
        const index = steps.findIndex((item) => item.id === current);
        return steps[(index + 1) % steps.length].id;
      });
    }, 2900);
    return () => window.clearTimeout(timer);
  }, [step, visible, reducedMotion]);

  const activeIndex = steps.findIndex((item) => item.id === step);
  const activeStep = steps[activeIndex];
  return (
    <section
      ref={sectionRef}
      aria-labelledby="booking-demo-heading"
      className="booking-demo-section overflow-hidden py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-5 lg:grid-cols-[.92fr_1.08fr] lg:gap-16 lg:px-10">
        <div className="relative z-20">
          <p className="text-xs font-black tracking-[.18em] text-[#C76500]">
            SIMPLE PRIVATE TRAVEL
          </p>
          <h2
            id="booking-demo-heading"
            className="mt-4 max-w-[560px] text-[34px] font-bold leading-[1.04] tracking-[-.045em] text-[#21140A] sm:text-[46px]"
          >
            Booking your ride is simple
          </h2>
          <p className="mt-5 max-w-[570px] text-base leading-7 text-[#65584E] sm:text-lg">
            From pickup to confirmation in just a few simple steps. Enter your
            journey, choose your ride, review your fare and confirm your Waydidi booking.
          </p>
        </div>

        <div className="booking-demo-visual relative mx-auto h-[350px] w-full max-w-[590px] sm:h-[390px]">
          <div aria-hidden="true" className="booking-demo-blob absolute left-[62%] top-1/2 size-[280px] -translate-x-1/2 -translate-y-1/2 rounded-[44%_56%_48%_52%] bg-[#FF8A05] sm:size-[340px]" />
          <div aria-hidden="true" className="absolute right-[10%] top-[7%] size-16 rounded-full bg-[#FFE2BE] sm:size-20" />

          <div className="booking-demo-phone absolute left-[62%] top-1/2 z-10 w-[min(82vw,338px)] rounded-[42px] bg-[#17120E] p-[9px] shadow-[0_34px_80px_rgba(83,43,8,.28)]">
            <div className="relative h-[546px] overflow-hidden rounded-[34px] bg-white">
              <PhoneStatusBar />
              {step === "trip" ? (
                <div key={step} className="booking-demo-scene h-[calc(100%-2.25rem)] bg-[#FF8A05]">
                  <TripScene />
                </div>
              ) : (
                <>
                  <div className="flex h-14 items-end justify-between bg-[#FFF8EF] px-5 pb-2.5 text-[#FF8A05]">
                    <WaydidiLogo className="h-7 w-auto" />
                    <span className="text-[10px] font-black tracking-[.14em] text-[#7B6653]">PRIVATE RIDE</span>
                  </div>
                  <div key={step} className="booking-demo-scene h-[calc(100%-5.75rem)]">
                    {step === "vehicle" && <VehicleScene />}
                    {step === "fare" && <FareScene />}
                    {step === "confirmation" && <ConfirmationScene />}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="booking-demo-float absolute bottom-2 left-0 z-20 w-[210px] rounded-[22px] bg-white p-4 shadow-[0_18px_45px_rgba(70,40,16,.18)] sm:bottom-12 sm:left-2 sm:w-[238px] sm:p-5">
            <p className="text-[10px] font-black tracking-[.15em] text-[#C76500]">
              STEP {activeIndex + 1} OF 4
            </p>
            <p className="mt-2 text-base font-black text-[#21140A] sm:text-lg">{activeStep.title}</p>
            <p className="mt-1 text-xs leading-5 text-[#76695E] sm:text-sm">{activeStep.status}</p>
            <div className="mt-3 h-1 overflow-hidden rounded-full bg-orange-100">
              <div
                className="h-full rounded-full bg-[#FF8A05] transition-[width] duration-500"
                style={{ width: `${((activeIndex + 1) / steps.length) * 100}%` }}
              />
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

function TripScene() {
  return (
    <Image
      src="/booking-demo-step-1.jpeg"
      alt="Waydidi mobile homepage showing the private ride booking form"
      width={1276}
      height={2048}
      className="h-full w-full object-contain object-top"
    />
  );
}

function PhoneStatusBar() {
  return (
    <div className="flex h-9 items-center justify-between bg-white px-5 text-[#050505]" aria-label="Phone status: 11:51, cellular signal, Wi-Fi and battery">
      <span className="flex items-center gap-1 text-[15px] font-black tracking-[-.03em]">
        11:51 <Navigation size={13} fill="currentColor" strokeWidth={2.5} />
      </span>
      <span className="flex items-center gap-2">
        <span className="flex h-4 items-end gap-[2px]" aria-hidden="true">
          <span className="h-1.5 w-[3px] rounded-full bg-current" />
          <span className="h-2.5 w-[3px] rounded-full bg-current" />
          <span className="h-3.5 w-[3px] rounded-full bg-current" />
          <span className="h-4 w-[3px] rounded-full bg-current" />
        </span>
        <Wifi size={19} strokeWidth={3} aria-hidden="true" />
        <span className="relative h-4 w-8 rounded-[5px] border-2 border-current" aria-hidden="true">
          <span className="absolute inset-[2px] right-[7px] rounded-[2px] bg-current" />
          <span className="absolute -right-[4px] top-[3px] h-1.5 w-0.5 rounded-r bg-current opacity-55" />
        </span>
      </span>
    </div>
  );
}

function VehicleScene() {
  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-5">
      <p className="text-[11px] font-bold text-[#A76A2F]">2 · CHOOSE YOUR RIDE</p>
      <h3 className="mt-1 text-xl font-black tracking-[-.03em] text-[#21140A]">A ride for every journey</h3>
      <p className="mt-1 text-xs text-[#76695E]">BKK Airport → Pattaya</p>
      <div className="mt-4 space-y-2.5">
        {vehicles.map((vehicle, index) => {
          const selected = vehicle.name === "Comfort SUV";
          return (
            <div
              key={vehicle.name}
              className={`booking-demo-vehicle relative rounded-2xl border p-3.5 ${selected ? "border-[#FF8A05] bg-[#FFF4E7]" : "border-slate-200 bg-white"}`}
              style={{ animationDelay: `${index * 90}ms` }}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[#21140A]">{vehicle.name}</p>
                  <p className="mt-1 text-[11px] text-[#76695E]">{vehicle.capacity}</p>
                </div>
                <div className="text-right">
                  {selected && <span className="mb-1 ml-auto grid size-5 place-items-center rounded-full bg-[#FF8A05]"><Check size={13} strokeWidth={3} /></span>}
                  <p className="text-sm font-black text-[#21140A]">{vehicle.price}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <button type="button" tabIndex={-1} className="mt-auto flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FF8A05] text-sm font-black text-[#21140A]">
        Continue <ArrowRight size={16} />
      </button>
    </div>
  );
}

function FareScene() {
  return (
    <div className="flex h-full flex-col px-4 pb-4 pt-5">
      <p className="text-[11px] font-bold text-[#A76A2F]">3 · REVIEW YOUR FARE</p>
      <h3 className="mt-1 text-xl font-black tracking-[-.03em] text-[#21140A]">Everything looks good</h3>
      <div className="mt-4 rounded-2xl bg-[#FFF8EF] p-4">
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-1 text-[#FF8A05]">
            <span className="size-2 rounded-full bg-current" />
            <span className="h-9 w-px bg-orange-300" />
            <MapPin size={15} />
          </div>
          <div className="space-y-4 text-xs">
            <div><p className="text-[#8A7563]">Pickup</p><p className="mt-0.5 font-bold text-[#21140A]">BKK Airport</p></div>
            <div><p className="text-[#8A7563]">Drop-off</p><p className="mt-0.5 font-bold text-[#21140A]">Pattaya</p></div>
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-2xl border border-orange-100 p-4">
        <div className="flex items-center justify-between"><span className="text-xs text-[#76695E]">Vehicle</span><strong className="text-sm">Comfort SUV</strong></div>
        <div className="mt-3 flex items-center justify-between"><span className="text-xs text-[#76695E]">Travellers</span><strong className="text-sm">2 passengers · 2 luggage</strong></div>
        <div className="my-4 h-px bg-orange-100" />
        <div className="flex items-end justify-between"><span className="text-xs font-bold text-[#76695E]">Total fare</span><strong className="text-2xl tracking-[-.04em] text-[#21140A]">฿2,200</strong></div>
      </div>
      <p className="mt-3 flex items-center gap-2 text-[11px] font-bold text-[#6F6257]"><ShieldCheck size={14} className="text-[#FF8A05]" /> Private ride · price shown before payment</p>
      <button type="button" tabIndex={-1} className="booking-demo-button mt-auto flex h-12 items-center justify-center gap-2 rounded-xl bg-[#FF8A05] text-sm font-black text-[#21140A]">
        Confirm booking <ArrowRight size={16} />
      </button>
    </div>
  );
}

function ConfirmationScene() {
  return (
    <div className="flex h-full flex-col items-center px-5 pb-5 pt-9 text-center">
      <div className="booking-demo-check grid size-20 place-items-center rounded-full bg-[#FF8A05] shadow-[0_12px_30px_rgba(255,138,5,.3)]">
        <CheckCircle2 size={42} strokeWidth={2.4} className="text-[#21140A]" />
      </div>
      <p className="mt-5 text-[11px] font-bold tracking-[.14em] text-[#A76A2F]">WAYDIDI</p>
      <h3 className="mt-2 text-[26px] font-black tracking-[-.04em] text-[#21140A]">Booking confirmed</h3>
      <p className="mt-2 text-sm text-[#76695E]">Your private ride is reserved.</p>
      <div className="mt-6 w-full rounded-2xl bg-[#FFF8EF] p-4 text-left">
        <p className="text-[11px] font-bold text-[#9A7B5F]">TRIP</p>
        <p className="mt-1 font-black text-[#21140A]">BKK Airport → Pattaya</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div><p className="text-[#8A7563]">Vehicle</p><p className="mt-1 font-bold">Comfort SUV</p></div>
          <div><p className="text-[#8A7563]">Details</p><p className="mt-1 font-bold">2 people · 2 bags</p></div>
        </div>
      </div>
      <p className="mt-4 rounded-full bg-orange-100 px-4 py-2 text-xs font-bold text-[#8F4C0B]">Driver assignment in progress</p>
      <button type="button" tabIndex={-1} className="mt-auto h-12 w-full rounded-xl border border-[#FF8A05] bg-white text-sm font-black text-[#B85D00]">View booking</button>
    </div>
  );
}
