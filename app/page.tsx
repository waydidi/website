"use client";

import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  CalendarCheck2,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Luggage,
  MapPin,
  Menu,
  Minus,
  Headphones,
  Plus,
  Printer,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { WaydidiLogo } from "@/components/waydidi-logo";
import {
  GoogleRoutePicker,
  type RouteInfo,
} from "@/components/google-route-picker";

type Stage = "search" | "vehicle" | "payment" | "confirmation";
type Booking = {
  pickup: string;
  dropoff: string;
  date: string;
  time: string;
  passengers: number;
  luggage: number;
  name: string;
  email: string;
  phone: string;
  flightNumber: string;
  pickupSign: string;
  pickupInstructions: string;
  childSeats: number;
  oversizedLuggage: boolean;
  specialRequests: string;
  termsAccepted: boolean;
};
type FareQuote = {
  quoteId: string;
  area: { id: string; name: string; color: string; pricingType: string };
  distanceMeters: number;
  durationSeconds: number;
  prices: Record<
    string,
    { total: number; basePrice: number; distanceSurcharge: number }
  >;
  expiresAt: string;
};

const vehicles = [
  {
    id: "economy_sedan",
    name: "Economy sedan",
    tagline: "Affordable and practical",
    features: ["Comfortable city transfer", "Professional local driver"],
    people: 3,
    bags: 2,
    carryOns: 2,
    price: 1250,
    image: "/vehicle-economy-sedan.webp",
  },
  {
    id: "comfort_bmw",
    name: "Comfort BMW",
    tagline: "Premium sedan comfort",
    features: ["Refined interior", "Smooth private journey"],
    people: 3,
    bags: 3,
    carryOns: 2,
    price: 1800,
    popular: true,
  },
  {
    id: "comfort_suv",
    name: "Comfort SUV",
    tagline: "More room for every journey",
    features: ["Spacious passenger cabin", "Extra luggage capacity"],
    people: 4,
    bags: 4,
    carryOns: 3,
    price: 2200,
    image: "/vehicle-comfort-suv.webp",
  },
  {
    id: "premium_minivan",
    name: "Premium Minivan",
    tagline: "Comfort for larger groups",
    features: ["Roomy premium interior", "Ideal for families and groups"],
    people: 9,
    bags: 8,
    carryOns: 8,
    price: 2850,
    image: "/vehicle-premium-minivan.webp",
  },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("search");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [booking, setBooking] = useState<Booking>({
    pickup: "Suvarnabhumi Airport (BKK)",
    dropoff: "Grande Centre Point Sukhumvit 55, Bangkok",
    date: new Date(Date.now() + 86_400_000).toLocaleDateString("en-CA", {
      timeZone: "Asia/Bangkok",
    }),
    time: "09:00",
    passengers: 2,
    luggage: 2,
    name: "",
    email: "",
    phone: "",
    flightNumber: "",
    pickupSign: "",
    pickupInstructions: "",
    childSeats: 0,
    oversizedLuggage: false,
    specialRequests: "",
    termsAccepted: false,
  });
  const [vehicle, setVehicle] = useState("economy_sedan");
  const [payment, setPayment] = useState<"card" | "cash">("card");
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [fareQuote, setFareQuote] = useState<FareQuote | null>(null);
  const [pricingMessage, setPricingMessage] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const pricedVehicles = useMemo(
    () =>
      vehicles.map((item) => ({
        ...item,
        price: fareQuote?.prices[item.id]?.total ?? item.price,
      })),
    [fareQuote],
  );
  const chosenVehicle = useMemo(
    () =>
      pricedVehicles.find((item) => item.id === vehicle) ?? pricedVehicles[0],
    [vehicle, pricedVehicles],
  );
  const change = <K extends keyof Booking>(key: K, value: Booking[K]) =>
    setBooking((current) => ({ ...current, [key]: value }));

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMenuOpen(false);
    setStage("vehicle");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleRouteChange(info: RouteInfo | null) {
    setRouteInfo(info);
    setFareQuote(null);
    setPricingMessage("");
    if (!info?.pickupPlaceId || !info.dropoffPlaceId) return;
    try {
      const response = await fetch("/api/fare-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupPlaceId: info.pickupPlaceId,
          dropoffPlaceId: info.dropoffPlaceId,
        }),
      });
      const result = (await response.json()) as FareQuote & { error?: string };
      if (!response.ok) {
        setPricingMessage(result.error ?? "This route needs a custom quote.");
        return;
      }
      setFareQuote(result);
    } catch {
      setPricingMessage("Route pricing is temporarily unavailable.");
    }
  }

  async function confirmBooking() {
    if (
      !booking.name.trim() ||
      !/^\S+@\S+\.\S+$/.test(booking.email) ||
      !/^[+0-9() .-]{7,30}$/.test(booking.phone.trim())
    ) {
      setError(
        "Enter the passenger name, a valid email, and a contact phone number.",
      );
      return;
    }
    if (!booking.termsAccepted) {
      setError(
        "Accept the booking terms, cancellation policy, and privacy notice before payment.",
      );
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: booking.name,
          customerEmail: booking.email,
          customerPhone: booking.phone,
          flightNumber: booking.flightNumber,
          pickupSign: booking.pickupSign,
          pickupInstructions: booking.pickupInstructions,
          childSeats: booking.childSeats,
          oversizedLuggage: booking.oversizedLuggage,
          specialRequests: booking.specialRequests,
          termsAccepted: booking.termsAccepted,
          pickup: booking.pickup,
          dropoff: booking.dropoff,
          pickupDate: booking.date,
          pickupTime: booking.time,
          passengers: booking.passengers,
          luggage: booking.luggage,
          vehicle,
          paymentMethod: payment,
          fareQuoteId: fareQuote?.quoteId,
        }),
      });
      const result = (await response.json()) as {
        checkoutUrl?: string;
        error?: string;
      };
      if (!response.ok || !result.checkoutUrl)
        throw new Error(result.error ?? "Checkout could not start");
      window.location.assign(result.checkoutUrl);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "We could not confirm your booking.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white text-[#1f1726]">
      <section
        className={`relative overflow-hidden border-b border-slate-100 ${stage === "search" ? "bg-[#FF8A05] text-white" : "bg-white text-[#17171a]"}`}
      >
        <header
          className={`relative z-20 flex w-full items-center justify-between bg-[#FF8A05] px-5 text-white lg:px-8 ${stage === "search" ? "h-[112px]" : "h-[72px]"}`}
        >
          <a
            href="/"
            className="inline-flex text-white"
            aria-label="Waydidi home"
          >
            <WaydidiLogo
              className={`${stage === "search" ? "h-[88px]" : "h-11"} w-auto`}
            />
          </a>
          {stage === "search" ? (
            <nav className="hidden items-center gap-10 text-[16px] font-semibold xl:flex">
              <details className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                  Ride{" "}
                  <ChevronDown
                    className="transition group-open:rotate-180"
                    size={18}
                  />
                </summary>
                <div className="absolute left-0 top-full z-50 mt-5 w-56 rounded-2xl bg-white p-2 text-[#21140A] shadow-xl">
                  <a
                    href="#services"
                    className="block rounded-xl px-4 py-3 hover:bg-orange-50"
                  >
                    Airport transfer
                  </a>
                  <a
                    href="#services"
                    className="block rounded-xl px-4 py-3 hover:bg-orange-50"
                  >
                    A to B
                  </a>
                  <a
                    href="#services"
                    className="block rounded-xl px-4 py-3 hover:bg-orange-50"
                  >
                    Long journey
                  </a>
                </div>
              </details>
              <details className="group relative">
                <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                  Trip{" "}
                  <ChevronDown
                    className="transition group-open:rotate-180"
                    size={18}
                  />
                </summary>
                <div className="absolute left-0 top-full z-50 mt-5 w-56 rounded-2xl bg-white p-2 text-[#21140A] shadow-xl">
                  <a
                    href="#services"
                    className="block rounded-xl px-4 py-3 hover:bg-orange-50"
                  >
                    Day trip
                  </a>
                  <a
                    href="#services"
                    className="block rounded-xl px-4 py-3 hover:bg-orange-50"
                  >
                    Multi-day trip
                  </a>
                  <a
                    href="#services"
                    className="block rounded-xl px-4 py-3 hover:bg-orange-50"
                  >
                    Dinner cruise
                  </a>
                </div>
              </details>
              <a href="#support">About Waydidi</a>
              <button
                type="button"
                className="flex items-center gap-2"
                aria-label="Change language"
              >
                🇹🇭 <span>EN</span> <ChevronDown size={18} />
              </button>
              <a
                href="/booking/check"
                className="flex h-12 items-center gap-2 rounded-full bg-white px-6 font-bold text-[#D96F00]"
              >
                <CarFront size={20} /> Check your booking
              </a>
            </nav>
          ) : (
            <Progress stage={stage} inHeader />
          )}
          {stage === "search" && (
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  className="flex items-center gap-3 text-lg font-bold xl:hidden"
                  aria-label="Open navigation menu"
                >
                  Menu <Menu />
                </button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[min(430px,92vw)] max-w-none gap-0 border-l border-slate-200 bg-white p-0 text-black sm:max-w-[430px]"
                showCloseButton={false}
              >
                <SheetHeader className="flex-row items-center justify-between border-b border-slate-200 px-6 py-5">
                  <SheetTitle className="flex text-[#FF8A05]">
                    <WaydidiLogo className="h-20 w-auto" />
                    <span className="sr-only">Waydidi</span>
                  </SheetTitle>
                  <SheetClose
                    className="grid size-11 place-items-center rounded-full bg-slate-100 text-black transition hover:bg-slate-200"
                    aria-label="Close navigation menu"
                  >
                    <X size={23} />
                  </SheetClose>
                </SheetHeader>
                <nav
                  className="flex-1 overflow-y-auto px-6 py-3 text-black"
                  aria-label="Mobile navigation"
                >
                  <div className="border-b border-slate-200 py-5">
                    <p className="mb-3 text-xs font-black uppercase tracking-[.16em] text-slate-400">
                      Ride
                    </p>
                    <div className="grid">
                      <SheetClose asChild>
                        <a
                          href="#services"
                          className="rounded-xl py-3 text-lg font-bold hover:text-[#D96F00]"
                        >
                          Airport transfer
                        </a>
                      </SheetClose>
                      <SheetClose asChild>
                        <a
                          href="#services"
                          className="rounded-xl py-3 text-lg font-bold hover:text-[#D96F00]"
                        >
                          A to B
                        </a>
                      </SheetClose>
                      <SheetClose asChild>
                        <a
                          href="#services"
                          className="rounded-xl py-3 text-lg font-bold hover:text-[#D96F00]"
                        >
                          Long journey
                        </a>
                      </SheetClose>
                    </div>
                  </div>
                  <div className="border-b border-slate-200 py-5">
                    <p className="mb-3 text-xs font-black uppercase tracking-[.16em] text-slate-400">
                      Trip
                    </p>
                    <div className="grid">
                      <SheetClose asChild>
                        <a
                          href="#services"
                          className="rounded-xl py-3 text-lg font-bold hover:text-[#D96F00]"
                        >
                          Day trip
                        </a>
                      </SheetClose>
                      <SheetClose asChild>
                        <a
                          href="#services"
                          className="rounded-xl py-3 text-lg font-bold hover:text-[#D96F00]"
                        >
                          Multi-day trip
                        </a>
                      </SheetClose>
                      <SheetClose asChild>
                        <a
                          href="#services"
                          className="rounded-xl py-3 text-lg font-bold hover:text-[#D96F00]"
                        >
                          Dinner cruise
                        </a>
                      </SheetClose>
                    </div>
                  </div>
                  <div className="grid border-b border-slate-200 py-5">
                    <SheetClose asChild>
                      <a
                        href="#support"
                        className="rounded-xl py-3 text-lg font-bold hover:text-[#D96F00]"
                      >
                        About Waydidi
                      </a>
                    </SheetClose>
                  </div>
                </nav>
                <div className="mt-auto border-t border-slate-200 bg-white px-6 py-6">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-4 py-4 text-left font-bold text-black"
                  >
                    <span className="flex items-center gap-3">
                      <span aria-hidden="true">🇹🇭</span>
                      <span>English</span>
                    </span>
                    <ChevronDown size={18} />
                  </button>
                  <SheetClose asChild>
                    <a
                      href="/booking/check"
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#FF8A05] px-5 py-4 font-bold text-white"
                    >
                      <CarFront size={20} /> Check your booking
                    </a>
                  </SheetClose>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </header>

        {stage === "search" && (
          <div className="relative z-10 w-full px-5 pb-12 pt-8 lg:px-10 lg:pb-18 lg:pt-12">
            <div className="mb-6 max-w-2xl">
              <p className="mb-3 text-xs font-bold uppercase tracking-[.18em] text-white/80">
                Private transfers across Thailand
              </p>
              <h1 className="text-[2rem] font-medium leading-[1.08] tracking-[-.045em] sm:text-[2.8rem] lg:text-[3.2rem]">
                A private ride that moves at your pace.
              </h1>
            </div>
            <div className="mb-4 flex max-w-md gap-6 border-b border-white/35 text-base sm:text-lg">
              <button className="border-b-2 border-white px-2 pb-3 font-semibold text-white">
                Transfers
              </button>
              <button className="px-1.5 pb-3 text-white/80" type="button">
                Hourly driver
              </button>
              <button className="px-1.5 pb-3 text-white/80" type="button">
                Day trips
              </button>
            </div>

            <form onSubmit={search} className="w-full">
              <div className="overflow-visible rounded-[18px] border border-slate-200 bg-white text-slate-950 shadow-lg shadow-slate-900/10 lg:grid lg:grid-cols-[1.15fr_1.15fr_.72fr_.7fr_auto] lg:divide-x lg:divide-slate-200">
                <GoogleRoutePicker
                  pickup={booking.pickup}
                  dropoff={booking.dropoff}
                  onPickupChange={(value) => {
                    change("pickup", value);
                    setFareQuote(null);
                  }}
                  onDropoffChange={(value) => {
                    change("dropoff", value);
                    setFareQuote(null);
                  }}
                  onRouteChange={handleRouteChange}
                />
                <button
                  type="button"
                  onClick={() => setDateOpen(!dateOpen)}
                  className="flex min-h-[64px] items-center gap-3 border-b border-slate-100 px-4 py-3 text-left lg:border-b-0"
                  aria-expanded={dateOpen}
                >
                  <CalendarDays className="shrink-0 text-[#101624]" size={19} />
                  <span className="w-full">
                    <span className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                      Date
                    </span>
                    <span className="block text-[16px]">
                      {formatDateLabel(booking.date)}
                    </span>
                  </span>
                  <ChevronDown
                    className={
                      dateOpen ? "rotate-180 transition" : "transition"
                    }
                    size={18}
                  />
                </button>
                <div className="relative flex min-h-[64px] items-center px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setPeopleOpen(!peopleOpen)}
                    className="flex w-full items-center justify-between"
                    aria-expanded={peopleOpen}
                    aria-label="Passengers and luggage"
                  >
                    <span className="flex items-center gap-3 font-semibold">
                      <span className="flex items-center gap-1.5">
                        <Users size={18} /> {booking.passengers}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Luggage size={18} /> {booking.luggage}
                      </span>
                    </span>
                    <ChevronDown
                      className={
                        peopleOpen ? "rotate-180 transition" : "transition"
                      }
                      size={18}
                    />
                  </button>
                  {peopleOpen && (
                    <div className="absolute right-0 top-full z-30 mt-2 grid w-[min(320px,calc(100vw-40px))] gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:grid-cols-2">
                      <Counter
                        label="Passengers"
                        value={booking.passengers}
                        min={1}
                        onChange={(value) => change("passengers", value)}
                      />
                      <Counter
                        label="Luggage"
                        value={booking.luggage}
                        min={0}
                        onChange={(value) => change("luggage", value)}
                      />
                    </div>
                  )}
                </div>
                <div className="flex items-center border-t border-slate-100 p-2 lg:border-t-0">
                  <button
                    className="flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#FF8A05] px-6 text-base font-bold text-white transition hover:bg-[#E97D00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A05] focus-visible:ring-offset-2 lg:w-auto"
                    type="submit"
                  >
                    Search vehicles <ArrowRight size={18} />
                  </button>
                </div>
              </div>
              <div
                className="mt-3 grid grid-cols-2 overflow-hidden rounded-[18px] border border-white/40 bg-white text-slate-950 shadow-md shadow-orange-950/10 lg:grid-cols-4 lg:divide-x lg:divide-slate-200"
                aria-label="Waydidi service guarantees"
              >
                {[
                  {
                    icon: BadgeDollarSign,
                    title: "Fixed prices",
                    detail: "No surprise fees",
                  },
                  {
                    icon: ShieldCheck,
                    title: "Professional drivers",
                    detail: "Verified local service",
                  },
                  {
                    icon: CalendarCheck2,
                    title: "Free cancellation",
                    detail: "Up to 24 hours before",
                  },
                  {
                    icon: Headphones,
                    title: "Customer support",
                    detail: "Help when you need it",
                  },
                ].map(({ icon: Icon, title, detail }) => (
                  <div
                    key={title}
                    className="flex min-h-[76px] items-center gap-3 border-b border-slate-100 px-4 py-3 odd:border-r lg:border-b-0 lg:border-r-0"
                  >
                    <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#FFF0DF] text-[#D96F00]">
                      <Icon size={18} strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0">
                      <strong className="block text-sm leading-5">{title}</strong>
                      <span className="block text-xs leading-4 text-slate-500">{detail}</span>
                    </span>
                  </div>
                ))}
              </div>
              {dateOpen && (
                <DateTimePicker
                  date={booking.date}
                  time={booking.time}
                  onDateChange={(value) => change("date", value)}
                  onTimeChange={(value) => change("time", value)}
                  onClose={() => setDateOpen(false)}
                />
              )}
              {(fareQuote || pricingMessage) && (
                <div
                  className={`mt-3 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${fareQuote ? "bg-white text-slate-800" : "bg-amber-50 text-amber-900"}`}
                >
                  {fareQuote ? (
                    <>
                      <span
                        className="size-3 rounded-full"
                        style={{ backgroundColor: fareQuote.area.color }}
                      />
                      <strong>{fareQuote.area.name}</strong>
                      <span>
                        {(fareQuote.distanceMeters / 1000).toFixed(1)} km
                      </span>
                      <span className="text-slate-500">
                        Price locked for 20 minutes
                      </span>
                    </>
                  ) : (
                    pricingMessage
                  )}
                </div>
              )}
            </form>
          </div>
        )}
      </section>

      {stage === "vehicle" && (
        <section className="bg-white pb-28">
          <div className="mx-auto max-w-[1320px] px-5 py-9 lg:px-10 lg:py-12">
            <h1 className="mb-7 text-4xl font-bold tracking-[-.045em] sm:text-5xl">
              Select your ride
            </h1>
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,836px)_360px] lg:gap-14">
              <div className="rounded-3xl bg-white p-4 shadow-sm sm:p-5">
                <div className="grid gap-3">
                  {pricedVehicles.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setVehicle(item.id)}
                      className={`relative w-full rounded-2xl border-2 p-[18px] text-left transition sm:p-[22px] ${vehicle === item.id ? "border-[#FF8A05] bg-[#FFF2E2]" : "border-slate-200 bg-white hover:border-slate-300"}`}
                    >
                      <div className="grid grid-cols-[106px_1fr_auto] gap-4 sm:grid-cols-[154px_1fr_auto]">
                        <span
                          className="grid min-h-[106px] place-items-center"
                          aria-hidden={!item.image}
                        >
                          {item.image ? (
                            <img
                              src={item.image}
                              alt={`${item.name} vehicle`}
                              className="h-[106px] w-full object-contain sm:h-[123px]"
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2 text-lg font-bold">
                            {item.name}
                            {item.popular && (
                              <span className="rounded-full bg-[#21140A] px-2.5 py-1 text-[11px] font-bold text-white">
                                ★ Best for you
                              </span>
                            )}
                          </span>
                          <span className="mt-0.5 block text-sm font-bold text-[#D96F00]">
                            {item.tagline}
                          </span>
                          <span className="mt-3 hidden flex-wrap gap-2 sm:flex">
                            {item.features.map((feature) => (
                              <span
                                key={feature}
                                className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                              >
                                {feature}
                              </span>
                            ))}
                          </span>
                        </span>
                        <strong className="whitespace-nowrap text-lg sm:text-xl">
                          ฿{item.price.toLocaleString()}
                        </strong>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 border-t border-slate-200 pt-3 text-xs font-semibold text-slate-500">
                        <span className="flex items-center gap-1">
                          <Users size={15} />
                          1–{item.people}
                        </span>
                        <span className="flex items-center gap-1">
                          <Luggage size={15} />
                          {item.bags} bags
                        </span>
                        <span className="flex items-center gap-1">
                          <Luggage size={15} />
                          {item.carryOns} carry-ons
                        </span>
                        {vehicle === item.id && (
                          <CheckCircle2
                            className="ml-auto text-[#D96F00]"
                            size={20}
                          />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <RideSummary
                booking={booking}
                vehicle={chosenVehicle}
                routeInfo={routeInfo}
                fareQuote={fareQuote}
                onEdit={() => setStage("search")}
              />
            </div>
          </div>
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-[1320px] items-center justify-between px-5 py-4 lg:px-10">
              <button
                onClick={() => setStage("search")}
                className="flex h-12 items-center gap-2 rounded-full bg-slate-100 px-6 font-bold"
              >
                <ArrowLeft size={19} /> Back
              </button>
              <button
                onClick={() => {
                  setStage("payment");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="flex h-12 items-center gap-2 rounded-full bg-[#FF8A05] px-7 font-bold text-[#21140A]"
              >
                Next: Traveler details <ArrowRight size={19} />
              </button>
            </div>
          </div>
        </section>
      )}

      {stage === "payment" && (
        <section className="mx-auto grid max-w-[1100px] gap-6 px-5 py-12 lg:grid-cols-[1fr_360px] lg:px-10 lg:py-16">
          <div>
            <h2 className="text-3xl font-black tracking-[-.04em] sm:text-4xl">
              Passenger & payment
            </h2>
            <div className="mt-8 rounded-3xl bg-[#f3f3f3] p-6 sm:p-8">
              <h3 className="text-lg font-black">Lead passenger</h3>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <label className="text-sm font-bold">
                  Full name
                  <input
                    required
                    value={booking.name}
                    onChange={(e) => change("name", e.target.value)}
                    className="mt-2 h-13 w-full rounded-xl border border-slate-200 px-4 text-base outline-none focus:border-[#FF8A05]"
                    placeholder="Passenger name"
                  />
                </label>
                <label className="text-sm font-bold">
                  Confirmation email
                  <input
                    required
                    type="email"
                    value={booking.email}
                    onChange={(e) => change("email", e.target.value)}
                    className="mt-2 h-13 w-full rounded-xl border border-slate-200 px-4 text-base outline-none focus:border-[#FF8A05]"
                    placeholder="you@email.com"
                  />
                </label>
                <label className="text-sm font-bold">
                  Phone or WhatsApp
                  <input
                    required
                    type="tel"
                    value={booking.phone}
                    onChange={(e) => change("phone", e.target.value)}
                    className="mt-2 h-13 w-full rounded-xl border border-slate-200 px-4 text-base outline-none focus:border-[#FF8A05]"
                    placeholder="+66 81 234 5678"
                  />
                </label>
                <label className="text-sm font-bold">
                  Flight number{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                  <input
                    value={booking.flightNumber}
                    onChange={(e) => change("flightNumber", e.target.value)}
                    maxLength={30}
                    className="mt-2 h-13 w-full rounded-xl border border-slate-200 px-4 text-base uppercase outline-none focus:border-[#FF8A05]"
                    placeholder="TG 123"
                  />
                </label>
                <label className="text-sm font-bold">
                  Pickup sign name{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                  <input
                    value={booking.pickupSign}
                    onChange={(e) => change("pickupSign", e.target.value)}
                    maxLength={80}
                    className="mt-2 h-13 w-full rounded-xl border border-slate-200 px-4 text-base outline-none focus:border-[#FF8A05]"
                    placeholder="Name shown on the sign"
                  />
                </label>
              </div>
              <div className="mt-5">
                <label className="text-sm font-bold">
                  Special requests{" "}
                  <span className="font-normal text-slate-400">(optional)</span>
                  <textarea
                    value={booking.specialRequests}
                    onChange={(e) => change("specialRequests", e.target.value)}
                    maxLength={500}
                    rows={3}
                    className="mt-2 w-full resize-none rounded-xl border border-slate-200 px-4 py-3 text-base outline-none focus:border-[#FF8A05]"
                    placeholder="Accessibility needs or other requests"
                  />
                </label>
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm">
                <input
                  type="checkbox"
                  checked={booking.oversizedLuggage}
                  onChange={(e) => change("oversizedLuggage", e.target.checked)}
                  className="mt-1 size-4 accent-[#FF8A05]"
                />
                <span>
                  <strong className="block">Oversized luggage</strong>
                  <span className="text-slate-500">
                    Sports equipment, golf bags, surfboards, or unusually large
                    items.
                  </span>
                </span>
              </label>
              <h3 className="mt-8 text-lg font-black">Payment method</h3>
              <div className="mt-4 grid gap-3">
                <button
                  type="button"
                  onClick={() => setPayment("card")}
                  className={`flex items-center gap-4 rounded-2xl border-2 p-4 text-left ${payment === "card" ? "border-[#FF8A05] bg-orange-50" : "border-slate-200 bg-white"}`}
                >
                  <CreditCard className="text-[#D96F00]" size={25} />
                  <span>
                    <strong className="block">Stripe secure checkout</strong>
                    <span className="text-sm text-slate-500">
                      Pay online by card or available local method
                    </span>
                  </span>
                  {payment === "card" && (
                    <CheckCircle2
                      className="ml-auto text-[#D96F00]"
                      size={21}
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setPayment("cash")}
                  className={`flex items-center gap-4 rounded-2xl border-2 p-4 text-left ${payment === "cash" ? "border-[#FF8A05] bg-orange-50" : "border-slate-200 bg-white"}`}
                >
                  <span className="grid size-7 place-items-center rounded-md bg-[#FF8A05] text-sm font-black text-white">
                    ฿
                  </span>
                  <span>
                    <strong className="block">Cash — test booking</strong>
                    <span className="text-sm text-slate-500">
                      Complete now and pay the driver at pickup
                    </span>
                  </span>
                  {payment === "cash" && (
                    <CheckCircle2
                      className="ml-auto text-[#D96F00]"
                      size={21}
                    />
                  )}
                </button>
              </div>
              <div className="mt-6 flex items-start gap-3 rounded-2xl bg-orange-50 p-4 text-sm leading-6 text-slate-700">
                <ShieldCheck
                  className="mt-0.5 shrink-0 text-[#D96F00]"
                  size={21}
                />
                <p>
                  You’ll continue to Stripe’s hosted checkout. Waydidi never
                  receives or stores your card details.
                </p>
              </div>
              <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4 text-sm leading-6">
                <input
                  type="checkbox"
                  required
                  checked={booking.termsAccepted}
                  onChange={(event) =>
                    change("termsAccepted", event.target.checked)
                  }
                  className="mt-1 size-5 shrink-0 accent-[#FF8A05]"
                />
                <span>
                  I agree to the{" "}
                  <a
                    href="/terms"
                    target="_blank"
                    className="font-bold text-[#B85E00] underline underline-offset-2"
                  >
                    booking terms and 24-hour cancellation policy
                  </a>
                  , and acknowledge the{" "}
                  <a
                    href="/privacy"
                    target="_blank"
                    className="font-bold text-[#B85E00] underline underline-offset-2"
                  >
                    privacy notice
                  </a>
                  .
                </span>
              </label>
              {error && (
                <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700">
                  {error}
                </p>
              )}
            </div>
            <button
              onClick={() => setStage("vehicle")}
              className="mt-5 flex items-center gap-2 text-sm font-bold text-slate-600"
            >
              <ArrowLeft size={18} /> Back to vehicles
            </button>
          </div>
          <aside className="h-fit rounded-3xl bg-[#071c61] p-6 text-white lg:sticky lg:top-6">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#FFD09A]">
              Booking summary
            </p>
            <h3 className="mt-3 text-xl font-black">{chosenVehicle.name}</h3>
            <p className="mt-1 text-sm text-white/60">
              {chosenVehicle.tagline}
            </p>
            <div className="my-6 border-t border-white/15" />
            <div className="space-y-3 text-sm">
              <SummaryLine
                label="Passengers"
                value={String(booking.passengers)}
              />
              <SummaryLine label="Luggage" value={String(booking.luggage)} />
              {booking.childSeats > 0 && (
                <SummaryLine
                  label="Child seats"
                  value={String(booking.childSeats)}
                />
              )}
              <SummaryLine
                label="Payment"
                value={payment === "card" ? "Online" : "Driver"}
              />
            </div>
            <div className="my-6 border-t border-white/15" />
            <div className="flex items-end justify-between">
              <span className="text-sm text-white/65">Total</span>
              <span className="text-3xl font-black">
                ฿{chosenVehicle.price.toLocaleString()}
              </span>
            </div>
            <button
              onClick={confirmBooking}
              disabled={loading}
              className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-[#FF8A05] font-bold text-[#21140A] disabled:opacity-60"
            >
              {loading
                ? "Completing booking…"
                : payment === "cash"
                  ? "Complete cash booking"
                  : "Continue to secure payment"}{" "}
              {!loading && <ArrowRight size={19} />}
            </button>
          </aside>
        </section>
      )}

      {stage === "confirmation" && (
        <section className="mx-auto max-w-[900px] px-5 py-12 lg:px-10 lg:py-16">
          <div className="booking-confirmation overflow-hidden rounded-[32px] bg-white shadow-xl shadow-orange-950/10">
            <div className="bg-[#FF8A05] p-7 text-white sm:p-10">
              <a href="/" className="mb-8 inline-flex text-white" aria-label="Waydidi home"><WaydidiLogo className="h-20 w-auto" /></a>
              <span className="grid size-14 place-items-center rounded-full bg-white/20 text-white">
                <Check size={30} strokeWidth={3} />
              </span>
              <p className="mt-6 text-sm font-bold uppercase tracking-[.16em] text-white/80">Payment received</p>
              <h2 className="mt-6 text-3xl font-black tracking-[-.04em] sm:text-5xl">
                Your ride is booked.
              </h2>
              <p className="mt-3 text-white/65">
                Booking reference{" "}
                <strong className="text-white">{reference}</strong>
              </p>
            </div>
            <div className="p-7 sm:p-10">
              <div className="grid gap-8 sm:grid-cols-2">
                <Detail label="Passenger" value={booking.name} />
                <Detail label="Email" value={booking.email} />
                <Detail label="Pickup" value={booking.pickup} />
                <Detail label="Drop-off" value={booking.dropoff} />
                <Detail
                  label="Date & time"
                  value={`${booking.date} at ${booking.time}`}
                />
                <Detail
                  label="Travelers"
                  value={`${booking.passengers} passengers · ${booking.luggage} bags`}
                />
                <Detail label="Vehicle" value={chosenVehicle.name} />
                <Detail
                  label="Total"
                  value={`฿${chosenVehicle.price.toLocaleString()}`}
                />
              </div>
              <div className="no-print mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => window.print()}
                  className="flex h-13 items-center justify-center gap-2 rounded-full bg-[#FF8A05] px-7 font-bold text-[#21140A]"
                >
                  <Printer size={19} /> Save confirmation as PDF
                </button>
                <button
                  onClick={() => {
                    setStage("search");
                    setReference("");
                  }}
                  className="h-13 rounded-full border border-slate-200 px-7 font-bold"
                >
                  Book another ride
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {stage === "search" && (
        <>
          <ServiceCards />
          <WaydidiFooter />
        </>
      )}
    </main>
  );
}

const pickupTimes = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const displayHour = hours % 12 || 12;
  return {
    value,
    label: `${displayHour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`,
  };
});

function dateFromValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(value: string) {
  return dateFromValue(value).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function WaydidiFooter() {
  const paymentBadges = [
    "stripe",
    "VISA",
    "●●",
    "PromptPay",
    "Apple Pay",
    "G Pay",
  ];
  return (
    <footer id="support" className="no-print mt-14 bg-white text-[#1f1726]">
      <div className="mx-auto max-w-[1180px] px-5 lg:px-0">
        <div className="grid gap-5 md:grid-cols-3">
          <a
            href="#"
            className="group overflow-hidden rounded-2xl bg-[#f3f3f3]"
            onClick={(event) => event.preventDefault()}
          >
            <div className="min-h-[170px] p-7">
              <h3 className="max-w-[240px] text-2xl font-black leading-7">
                Frequently Asked Questions
              </h3>
              <p className="mt-6 max-w-[260px] text-base leading-6">
                Answers about booking, pickup, luggage, cancellations, and your
                driver.
              </p>
            </div>
            <div className="h-[220px] overflow-hidden bg-[#f4c4c9]">
              <img
                src="/hero-driver-customer.webp"
                alt="Waydidi driver and passenger"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              />
            </div>
          </a>
          <a
            href="/terms"
            className="group overflow-hidden rounded-2xl bg-[#f3f3f3]"
          >
            <div className="min-h-[170px] p-7">
              <h3 className="max-w-[240px] text-2xl font-black leading-7">
                Online Payment Process
              </h3>
              <p className="mt-6 max-w-[260px] text-base leading-6">
                Pay securely online through Stripe and receive your confirmation
                automatically.
              </p>
            </div>
            <div className="grid h-[220px] place-items-center bg-[#8eddbb]">
              <span className="relative grid size-32 place-items-center rounded-[28px] bg-white text-[#FF8A05] shadow-xl transition duration-300 group-hover:-translate-y-1">
                <CreditCard size={64} strokeWidth={1.8} />
                <CheckCircle2
                  className="absolute -bottom-3 -right-3 rounded-full bg-white text-emerald-600"
                  size={42}
                  fill="white"
                />
              </span>
            </div>
          </a>
          <a
            href="#services"
            className="group overflow-hidden rounded-2xl bg-[#f3f3f3]"
          >
            <div className="min-h-[170px] p-7">
              <h3 className="max-w-[240px] text-2xl font-black leading-7">
                Thailand Transfer Options
              </h3>
              <p className="mt-6 max-w-[260px] text-base leading-6">
                Airport transfers, private rides, long journeys, and comfortable
                day trips.
              </p>
            </div>
            <div className="h-[220px] overflow-hidden bg-[#ffdd8a]">
              <img
                src="/waydidi-transfer.png"
                alt="Waydidi private transfer in Thailand"
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              />
            </div>
          </a>
        </div>

        <div className="mt-20 border-t border-slate-200 pt-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_.8fr_.8fr_.8fr]">
            <div>
              <a
                href="/"
                className="inline-flex text-[#FF8A05]"
                aria-label="Waydidi home"
              >
                <WaydidiLogo className="h-16 w-auto" />
              </a>
              <p className="mt-5 max-w-sm text-sm leading-6 text-slate-600">
                Private car transfers across Thailand with professional drivers,
                clear pricing, and secure online booking.
              </p>
              <h3 className="mt-8 font-black">Accepted Payments</h3>
              <div className="mt-4 flex max-w-sm flex-wrap gap-2">
                {paymentBadges.map((badge) => (
                  <span
                    key={badge}
                    className={`grid h-10 min-w-14 place-items-center rounded-md border border-slate-200 bg-white px-3 text-sm font-black ${badge === "stripe" ? "text-[#635BFF]" : badge === "VISA" ? "italic text-[#1434CB]" : badge === "●●" ? "tracking-[-.35em] text-[#EB001B]" : "text-slate-800"}`}
                  >
                    {badge}
                  </span>
                ))}
              </div>
            </div>
            <FooterLinks
              title="Ride"
              links={[
                "Airport transfer",
                "A to B",
                "Long journey",
                "Check your booking",
              ]}
            />
            <FooterLinks
              title="Trips"
              links={[
                "Day trip",
                "Multi-day trip",
                "Dinner cruise",
                "Private driver",
              ]}
            />
            <FooterLinks
              title="Help"
              links={[
                "Waydidi help",
                "Cancellation policy",
                "Contact us",
                "Safety & security",
              ]}
            />
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-5 border-t border-slate-200 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-6 gap-y-3 font-semibold">
            <a href="#support">Help center</a>
            <a href="/booking/check">Check booking</a>
            <a href="#support">Contact Waydidi</a>
          </div>
          <div className="flex flex-wrap gap-5">
            <a href="/terms">Terms of Use</a>
            <a href="/privacy">Privacy Policy</a>
          </div>
          <p className="text-slate-500">© 2026 Waydidi. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterLinks({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h3 className="font-black">{title}</h3>
      <ul className="mt-5 space-y-3 text-sm text-slate-600">
        {links.map((link) => (
          <li key={link}>
            <a
              href={
                link === "Check your booking"
                  ? "/booking/check"
                  : link.includes("policy")
                    ? "/terms"
                    : "#services"
              }
              className="hover:text-[#D96F00]"
            >
              {link}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DateTimePicker({
  date,
  time,
  onDateChange,
  onTimeChange,
  onClose,
}: {
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onClose: () => void;
}) {
  const selected = dateFromValue(date);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const nextMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    1,
  );
  const moveMonth = (amount: number) =>
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + amount, 1),
    );

  return (
    <div className="relative z-40 mt-2 rounded-[28px] border border-slate-200 bg-white p-5 text-[#17171a] shadow-2xl sm:p-7">
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <CalendarMonth
          month={visibleMonth}
          selected={date}
          onSelect={onDateChange}
          onPrevious={() => moveMonth(-1)}
          onNext={() => moveMonth(1)}
          nextMobileOnly
        />
        <div className="hidden md:block">
          <CalendarMonth
            month={nextMonth}
            selected={date}
            onSelect={onDateChange}
            onNext={() => moveMonth(1)}
          />
        </div>
      </div>
      <div className="mt-7 flex flex-col items-stretch justify-between gap-4 border-t border-slate-200 pt-5 sm:flex-row sm:items-end">
        <div className="grid overflow-hidden rounded-2xl border border-slate-200 sm:grid-cols-2">
          <div className="px-5 py-3">
            <span className="block text-sm font-semibold text-slate-500">
              Date
            </span>
            <strong className="font-semibold">{formatDateLabel(date)}</strong>
          </div>
          <label className="bg-slate-100 px-5 py-3">
            <span className="block text-sm font-semibold text-slate-500">
              Pickup time
            </span>
            <select
              value={time}
              onChange={(event) => onTimeChange(event.target.value)}
              className="min-w-40 bg-transparent text-[16px] font-semibold outline-none"
            >
              {pickupTimes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-11 rounded-full bg-[#FF8A05] px-7 font-bold text-[#21140A]"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function CalendarMonth({
  month,
  selected,
  onSelect,
  onPrevious,
  onNext,
  nextMobileOnly = false,
}: {
  month: Date;
  selected: string;
  onSelect: (value: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  nextMobileOnly?: boolean;
}) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });

  return (
    <div>
      <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
        {onPrevious ? (
          <button
            type="button"
            onClick={onPrevious}
            className="grid size-11 place-items-center rounded-full bg-slate-100"
            aria-label="Previous month"
          >
            <ArrowLeft size={20} />
          </button>
        ) : (
          <span />
        )}
        <h3 className="text-center text-xl font-bold">
          {month.toLocaleDateString("en-GB", {
            month: "long",
            year: "numeric",
          })}
        </h3>
        {onNext ? (
          <button
            type="button"
            onClick={onNext}
            className={`grid size-11 place-items-center rounded-full bg-slate-100 ${nextMobileOnly ? "md:hidden" : ""}`}
            aria-label="Next month"
          >
            <ArrowRight size={20} />
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="grid grid-cols-7 text-center text-sm font-bold">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <span key={day} className="py-2">
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {cells.map((day, index) =>
          day ? (
            (() => {
              const value = dateValue(
                new Date(month.getFullYear(), month.getMonth(), day),
              );
              const active = value === selected;
              return (
                <button
                  type="button"
                  key={value}
                  onClick={() => onSelect(value)}
                  className={`mx-auto grid size-10 place-items-center rounded-full text-[16px] transition ${active ? "bg-[#FF8A05] font-bold text-[#21140A]" : "hover:bg-orange-100"}`}
                >
                  {day}
                </button>
              );
            })()
          ) : (
            <span key={`empty-${index}`} className="size-10" />
          ),
        )}
      </div>
    </div>
  );
}

function ServiceCards() {
  const cards = [
    {
      title: "Ride",
      text: "Go anywhere in Thailand with Waydidi. Reserve your private ride, hop in, and enjoy.",
      image: "/service-ride-orange.png",
      alt: "Orange Waydidi private car",
    },
    {
      title: "Reserve",
      text: "Reserve your ride in advance so you can relax on the day of your trip.",
      image: "/service-reserve.png",
      alt: "Reservation calendar",
    },
    {
      title: "Day trips",
      text: "Book a private driver and explore several destinations in one comfortable day.",
      image: "/service-daytrip-route-vertical.png",
      alt: "Three location pins connected along a vertical day-trip route",
      imageClass: "service-card-image--large",
    },
  ];
  return (
    <section
      id="services"
      className="mx-auto max-w-[1024px] px-5 pt-10 lg:px-0 lg:pt-14"
    >
      <h2 className="text-3xl font-bold tracking-[-.04em] sm:text-[2rem]">
        Explore what you can do with Waydidi
      </h2>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.title}
            className="relative min-h-[190px] overflow-hidden rounded-2xl bg-[#f3f3f3] p-5"
          >
            <div className="relative z-10 w-[70%]">
              <h3 className="text-lg font-bold">{card.title}</h3>
              <p className="mt-2 text-sm leading-5 text-[#17171a]">
                {card.text}
              </p>
            </div>
            <a
              href="#"
              onClick={(event) => {
                event.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="absolute bottom-4 left-5 z-10 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold"
            >
              Details
            </a>
            <img
              className={`service-card-image ${card.imageClass ?? ""}`}
              src={card.image}
              alt={card.alt}
            />
          </article>
        ))}
      </div>
    </section>
  );
}

function RideSummary({
  booking,
  vehicle,
  routeInfo,
  fareQuote,
  onEdit,
}: {
  booking: Booking;
  vehicle: (typeof vehicles)[number];
  routeInfo: RouteInfo | null;
  fareQuote: FareQuote | null;
  onEdit: () => void;
}) {
  const dateLabel = new Date(`${booking.date}T12:00:00`).toLocaleDateString(
    "en-GB",
    { weekday: "short", day: "numeric", month: "short" },
  );
  return (
    <aside className="rounded-3xl bg-white p-5 shadow-sm lg:sticky lg:top-5 sm:p-6">
      <div className="flex items-center justify-between">
        <span className="rounded-full bg-[#FF8A05] px-3 py-1 text-xs font-bold text-[#21140A]">
          One way
        </span>
        <span className="flex items-center gap-5 text-sm font-bold">
          <span className="flex items-center gap-1.5">
            <Users size={16} />
            {booking.passengers}
          </span>
          <span className="flex items-center gap-1.5">
            <Luggage size={16} />
            {booking.luggage}
          </span>
        </span>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm">
          <CalendarDays size={15} />
          {dateLabel}
        </span>
        <button onClick={onEdit} className="font-bold text-[#D96F00]">
          Edit
        </button>
      </div>
      <div className="mt-4 grid grid-cols-[18px_minmax(0,1fr)] items-start gap-x-3 gap-y-4 text-sm">
        <span className="relative row-span-2 mt-1 after:absolute after:left-[7px] after:top-3 after:h-14 after:border-l-2 after:border-dotted after:border-slate-400">
          <span className="block size-2 rounded-full bg-[#1f1726]" />
        </span>
        <div className="min-w-0">
          <strong className="block text-base leading-5 [overflow-wrap:normal] [word-break:normal]">
            {booking.pickup}
          </strong>
          <span className="mt-1 block text-slate-500">{booking.time}</span>
        </div>
        <span className="col-start-1 row-start-2 mt-1 block size-2 rounded-full bg-[#1f1726]" />
        <div className="col-start-2 min-w-0">
          <strong className="block text-base leading-5 [overflow-wrap:normal] [word-break:normal]">
            {booking.dropoff}
          </strong>
          <span className="mt-1 block text-slate-500">Est. 10:00</span>
        </div>
      </div>
      {routeInfo && (
        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-100 px-4 py-3 text-sm">
          <span className="font-bold">Distance</span>
          <span>
            {routeInfo.distance} · approx. {routeInfo.duration}
          </span>
        </div>
      )}
      {fareQuote && (
        <div
          className="mt-3 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold"
          style={{ backgroundColor: `${fareQuote.area.color}18` }}
        >
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: fareQuote.area.color }}
          />
          {fareQuote.area.name} ·{" "}
          {fareQuote.area.pricingType === "fixed"
            ? "fixed fare"
            : "zone + distance"}
        </div>
      )}
      <div className="my-5 border-t border-slate-200" />
      <p className="text-sm font-bold">Price details</p>
      <div className="mt-3 space-y-3 text-sm">
        <div className="flex justify-between">
          <span>Transport</span>
          <span>฿{vehicle.price.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span>Stops</span>
          <span>฿0</span>
        </div>
      </div>
      <div className="my-5 border-t border-slate-200" />
      <div className="flex items-end justify-between">
        <strong>
          Total <span className="font-normal text-slate-500">(incl. VAT)</span>
        </strong>
        <strong className="text-3xl">฿{vehicle.price.toLocaleString()}</strong>
      </div>
      <div className="mt-5 flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm leading-5">
        <Clock3 className="mt-0.5 shrink-0 text-[#D96F00]" size={18} />
        <span>
          Free cancellation up to <strong>24 hours</strong> before pickup.
        </span>
      </div>
    </aside>
  );
}

function Counter({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-semibold">{label}</span>
      <span className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="grid size-9 place-items-center rounded-full border border-slate-200"
          aria-label={`Remove ${label.toLowerCase()}`}
        >
          <Minus size={16} />
        </button>
        <strong className="w-5 text-center">{value}</strong>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="grid size-9 place-items-center rounded-full bg-[#FF8A05] text-[#21140A]"
          aria-label={`Add ${label.toLowerCase()}`}
        >
          <Plus size={16} />
        </button>
      </span>
    </div>
  );
}
function Progress({
  stage,
  inHeader = false,
}: {
  stage: Stage;
  inHeader?: boolean;
}) {
  const active = stage === "vehicle" ? 1 : stage === "payment" ? 2 : 3;
  return (
    <div
      className={`${inHeader ? "ml-auto w-[min(430px,calc(100vw-120px))]" : "mx-auto max-w-3xl"} flex items-start justify-end`}
    >
      {["Select your ride", "Traveler & payment", "Confirmation"].map(
        (label, index) => (
          <div
            key={label}
            className="flex min-w-0 flex-1 items-start last:flex-none"
          >
            <span className="flex shrink-0 flex-col items-center">
              <span
                className={`grid ${inHeader ? "size-7 text-xs" : "size-8 text-sm"} place-items-center rounded-full font-bold ${inHeader ? (index + 1 <= active ? "bg-[#E87000] text-white ring-1 ring-white/40" : "bg-white/25 text-white/80") : index + 1 <= active ? "bg-[#FF8A05] text-white" : "bg-slate-100 text-slate-500"}`}
              >
                {index + 1 < active ? (
                  <Check size={inHeader ? 14 : 16} />
                ) : (
                  index + 1
                )}
              </span>
              <span
                className={`${inHeader ? "mt-1 text-[10px]" : "mt-1.5 text-xs"} hidden whitespace-nowrap font-semibold sm:block ${inHeader ? (index + 1 <= active ? "text-white" : "text-white/70") : index + 1 <= active ? "text-[#21140A]" : "text-slate-400"}`}
              >
                {label}
              </span>
            </span>
            {index < 2 && (
              <span
                className={`${inHeader ? "mx-2 mt-3.5 sm:mx-2.5" : "mx-2 mt-4 sm:mx-3"} h-0.5 min-w-5 flex-1 ${inHeader ? (index + 1 < active ? "bg-white" : "bg-white/30") : index + 1 < active ? "bg-[#FF8A05]" : "bg-slate-200"}`}
              />
            )}
          </div>
        ),
      )}
    </div>
  );
}
function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-white/60">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 font-bold text-slate-900">{value}</p>
    </div>
  );
}
