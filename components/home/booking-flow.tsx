"use client";

import { addonsTotal, CHILD_SEAT_THB, EXCHANGE_STOP_THB } from "@/lib/addons";
import { TIERS, tierDiscount, tierFreeAddons, type Tier } from "@/lib/member-tier-rules";
import { freeAddonsWithGifts } from "@/lib/gift-rules";
import { isAirportPickup } from "@/lib/waiting-policy";
import { earliestBangkokPickup } from "@/lib/booking-time";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Luggage,
  MapPin,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  Users,
  WifiOff,
  X,
  Wallet,
  Gift,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { BookingResultsMap, VehicleOption } from "@/components/booking-results-map";
import {
  GoogleRoutePicker,
  type RouteInfo,
} from "@/components/google-route-picker";
import { validateBookingReview, type ReviewFieldErrors } from "@/lib/booking-review";
import { VEHICLES, smallestFittingVehicle, vehicleFits, type VehicleId } from "@/lib/vehicles";
import { DateTimePicker } from "./date-time-picker";
import { BookingDetailsStep } from "./booking-details-step";
import { SiteHeader } from "@/components/site-header";
import { useCurrency } from "@/components/use-currency";
import { inclusionLines, type Inclusions } from "@/lib/route-inclusions";
import { DEMO_DROPOFF, DEMO_PICKUP, DEMO_PRICES, fetchDemoRoute, isDemoRoute } from "@/lib/demo-route";
import { formatTimeLabel } from "./dates";
import { formatDate, translate, type Locale, type MessageKey, type Messages } from "@/lib/i18n";
import enMessages from "@/messages/en.json";
import { I18nProvider, useI18n } from "@/components/i18n-provider";

type Stage = "search" | "vehicle" | "details" | "payment" | "review" | "confirmation";
type ServiceType = "transfer" | "hourly";
export type Booking = {
  pickup: string;
  dropoff: string;
  date: string;
  time: string;
  passengers: number;
  luggage: number;
  name: string;
  surname: string;
  email: string;
  phone: string;
  flightNumber: string;
  pickupSign: string;
  pickupInstructions: string;
  childSeats: number;
  oversizedLuggage: boolean;
  specialRequests: string;
  termsAccepted: boolean;
  bookedHours: number;
  // Tax invoice request (optional; older saved drafts may not have these).
  taxInvoice?: boolean;
  taxName?: string;
  taxId?: string;
  taxBranch?: string;
  taxAddress?: string;
  // Someone else who should also get the booking emails.
  copyEmail?: string;
};
type FareQuote = {
  quoteId: string;
  area: { id: string; name: string; color: string; pricingType: string };
  distanceMeters: number;
  durationSeconds: number;
  averageDurationMinutes?: number;
  encodedPolyline?: string;
  pickup?: { latitude: number; longitude: number };
  dropoff?: { latitude: number; longitude: number };
  path?: [number, number][];
  inclusions?: Inclusions;
  prices: Record<
    string,
    { total: number; basePrice: number; distanceSurcharge: number }
  >;
  expiresAt: string;
};
type HourlyQuote = {
  quoteId: string;
  area: { id: string; name: string; color: string };
  bookedHours: number;
  prices: Record<string, { total:number;basePrice:number;includedDistanceMeters:number;extraHourRate:number;extraDistanceRate:number }>;
  expiresAt: string;
};
type QuoteSummary = {
  currency: "THB";
  outbound: QuoteJourney;
  return: QuoteJourney | null;
  prices: Record<string, { outbound: number; return: number; total: number }>;
};
type QuoteJourney = {
  quoteId: string;
  pickup: string;
  dropoff: string;
  departureDate: string | null;
  departureTime: string | null;
  timezone: string;
  distanceMeters: number;
  durationSeconds: number;
};

type BookingRecoveryDraft = {
  version: 1;
  savedAt: number;
  stage: Exclude<Stage, "confirmation">;
  serviceType: ServiceType;
  booking: Booking;
  vehicle: string;
  payment: "card" | "cash";
  routeInfo: RouteInfo | null;
  fareQuote: FareQuote | null;
  returnFareQuote: FareQuote | null;
  quoteSummary: QuoteSummary | null;
  hourlyQuote: HourlyQuote | null;
  pickupPlaceId: string;
  departureSelected: boolean;
  returnTrip: boolean;
  returnDate: string;
  returnTime: string;
  adultPassengers: number;
  childPassengers: number;
  extraBagSets: number;
  checkoutAttemptId: string;
  quoteRequest?: boolean;
  demoRoute?: boolean;
};

const RECOVERY_DRAFT_KEY = "waydidi-booking-recovery-v1";

// The largest vehicle bounds the group: nothing carries more than this.
const MAX_GROUP_PASSENGERS = Math.max(...Object.values(VEHICLES).map((vehicle) => vehicle.passengers));
const MAX_GROUP_BAGS = Math.max(...Object.values(VEHICLES).map((vehicle) => vehicle.bags));
const RECOVERY_DRAFT_TTL = 2 * 60 * 60 * 1000;

const defaultPickupDate = new Date(Date.now() + 86_400_000).toLocaleDateString(
  "en-CA",
  { timeZone: "Asia/Bangkok" },
);

// Every navigation label resolves to a page that actually exists. Header,
// mobile drawer and footer all read from here so they cannot drift apart.
const vehicles = [
  {
    id: "economy_sedan",
    name: "Economy sedan",
    tagline: "Affordable and practical",
    price: 1250,
    image: "/vehicle-economy-sedan.webp",
  },
  {
    id: "comfort_bmw",
    name: "Comfort BMW",
    tagline: "Premium sedan comfort",
    price: 1800,
    image: "/vehicle-comfort-bmw.webp",
  },
  {
    id: "comfort_suv",
    name: "Comfort SUV",
    tagline: "More room for every journey",
    price: 2200,
    popular: true,
    image: "/vehicle-comfort-suv.webp",
  },
  {
    id: "premium_minivan",
    name: "Premium Minivan",
    tagline: "Comfort for larger groups",
    price: 2850,
    image: "/vehicle-premium-minivan.webp",
  },
];

export function BookingFlow({
  children,
  locale = "en",
  messages = enMessages,
}: {
  children: ReactNode;
  locale?: Locale;
  messages?: Messages;
}) {
  const t = (key: MessageKey, vars?: Record<string, string | number>) => translate(messages, key, vars);
  const [stage, setStage] = useState<Stage>("search");
  // Lets page-wide bottom bars (e.g. "Spin the wheel") step aside during booking.
  useEffect(() => {
    document.documentElement.dataset.bookingStage = stage;
    return () => { delete document.documentElement.dataset.bookingStage; };
  }, [stage]);
  const [serviceType, setServiceType] = useState<ServiceType>("transfer");
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [departureSelected, setDepartureSelected] = useState(false);
  const [returnDateOpen, setReturnDateOpen] = useState(false);
  const [returnTrip, setReturnTrip] = useState(false);
  const [returnDate, setReturnDate] = useState(defaultPickupDate);
  const [returnTime, setReturnTime] = useState("17:00");
  const [adultPassengers, setAdultPassengers] = useState(2);
  const [childPassengers, setChildPassengers] = useState(0);
  const [extraBagSets, setExtraBagSets] = useState(0);
  const [exchangeStop, setExchangeStop] = useState(false);
  const [booking, setBooking] = useState<Booking>({
    pickup: "Suvarnabhumi Airport (BKK)",
    dropoff: "Grande Centre Point Sukhumvit 55, Bangkok",
    date: defaultPickupDate,
    time: "09:00",
    passengers: 2,
    luggage: 2,
    name: "",
    surname: "",
    email: "",
    phone: "",
    flightNumber: "",
    pickupSign: "",
    pickupInstructions: "",
    childSeats: 0,
    oversizedLuggage: false,
    specialRequests: "",
    termsAccepted: false,
    bookedHours: 3,
  });
  const [vehicle, setVehicle] = useState("economy_sedan");
  const { currency, money, thb } = useCurrency();
  const [payment, setPayment] = useState<"card" | "cash">("card");
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [fareQuote, setFareQuote] = useState<FareQuote | null>(null);
  const [returnFareQuote, setReturnFareQuote] = useState<FareQuote | null>(null);
  const [quoteSummary, setQuoteSummary] = useState<QuoteSummary | null>(null);
  const [hourlyQuote, setHourlyQuote] = useState<HourlyQuote | null>(null);
  const [pickupPlaceId, setPickupPlaceId] = useState("");
  const [routePrefill, setRoutePrefill] = useState<{ pickupPlaceId?: string; dropoffPlaceId?: string; nonce: number } | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<{ id: string; label: string; placeId: string; address: string }[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [memberTier, setMemberTier] = useState<Tier | null>(null);
  const [vouchers, setVouchers] = useState({ childSeat: false, exchangeStop: false });
  const [savedBilling, setSavedBilling] = useState<{ id: string; name: string; taxId: string; branch: string; address: string }[]>([]);
  const [saveBilling, setSaveBilling] = useState(false);
  const [autoPromoTried, setAutoPromoTried] = useState(false);
  const [savedTravellers, setSavedTravellers] = useState<{ id: string; name: string; surname: string; email: string | null; phone: string | null; notes: string | null }[]>([]);
  const [placeMenu, setPlaceMenu] = useState<string | null>(null);
  const [pricingMessage, setPricingMessage] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ReviewFieldErrors>({});
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [draftReady, setDraftReady] = useState(false);
  // Without a Google Maps key there are no address suggestions, so nobody could
  // pass the search. Until keys are added the search takes typed addresses and
  // the flow runs as a quote request: no price, no payment.
  const [mapsAvailable, setMapsAvailable] = useState(true);
  const [quoteRequest, setQuoteRequest] = useState(false);
  // Results screen: "edit trip" popup (passengers, date and time).
  const [tripEditOpen, setTripEditOpen] = useState(false);
  const [routeEditOpen, setRouteEditOpen] = useState(false);
  // Set when a return is added straight from the results screen, so prices refresh once it is chosen.
  const [requoteReturn, setRequoteReturn] = useState(false);
  // Promo code applied at the Payment step (amount set by the server).
  const [promo, setPromo] = useState<{ code: string; title: string; discount: number } | null>(null);
  const [promoInput, setPromoInput] = useState("");
  const [promoError, setPromoError] = useState("");
  const [promoChecking, setPromoChecking] = useState(false);
  // Set while a picker opened from that popup is showing; brings it back after.
  const [returnToTripEdit, setReturnToTripEdit] = useState(false);
  // Prototype route shown on the map screen while live pricing is off.
  const [demoRoute, setDemoRoute] = useState(false);
  const [minPickupDate, setMinPickupDate] = useState("");
  const [minPickupTime, setMinPickupTime] = useState("");
  const checkoutAttemptRef = useRef("");
  const restoringDraftRef = useRef(false);

  useEffect(() => {
    if (restoringDraftRef.current) {
      restoringDraftRef.current = false;
      return;
    }
    checkoutAttemptRef.current = "";
  }, [booking, vehicle, payment, serviceType, fareQuote?.quoteId, returnFareQuote?.quoteId, hourlyQuote?.quoteId, promo?.code, exchangeStop]);

  useEffect(() => {
    // Browser connectivity is only available after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsOnline(navigator.onLine);
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  useEffect(() => {
    // Pre-fill contact details for signed-in customers without overwriting
    // anything the customer (or a restored draft) has already entered.
    let active = true;
    fetch("/api/account/session", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((account: { signedIn?: boolean; name?: string | null; surname?: string | null; email?: string; phone?: string | null; tier?: string } | null) => {
        if (!active || !account?.signedIn) return;
        setSignedIn(true);
        setMemberTier(TIERS.find((t) => t.id === account.tier) ?? TIERS[0]);
        fetch("/api/account/gifts", { cache: "no-store" }).then((r) => r.json()).then((d: { gifts?: { giftId: string; status: string }[] }) => {
          const has = (id: string) => Boolean(d.gifts?.some((g) => g.giftId === id && g.status === "available"));
          if (active) setVouchers({ childSeat: has("child_seat"), exchangeStop: has("exchange_stop") });
        }).catch(() => undefined);
        setBooking((current) => ({
          ...current,
          name: current.name || account.name || "",
          surname: current.surname || account.surname || "",
          email: current.email || account.email || "",
          phone: current.phone || account.phone || "",
        }));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(RECOVERY_DRAFT_KEY);
      const draft = raw ? (JSON.parse(raw) as BookingRecoveryDraft) : null;
      const valid = draft?.version === 1 && Date.now() - draft.savedAt < RECOVERY_DRAFT_TTL;
      if (valid && draft) {
        restoringDraftRef.current = true;
        // Restore one coherent browser-session snapshot after hydration.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setStage(draft.stage);
        // Give the restored step a history entry of its own, so Back does not
        // immediately leave the site.
        window.history.replaceState({ waydidiStage: draft.stage }, "");
        setServiceType(draft.serviceType);
        setBooking({ ...draft.booking, surname: draft.booking.surname ?? "" });
        setVehicle(draft.vehicle);
        setPayment(draft.payment);
        setRouteInfo(draft.routeInfo);
        setFareQuote(draft.fareQuote);
        setReturnFareQuote(draft.returnFareQuote);
        setQuoteSummary(draft.quoteSummary);
        setHourlyQuote(draft.hourlyQuote);
        setPickupPlaceId(draft.pickupPlaceId);
        setDepartureSelected(draft.departureSelected);
        setReturnTrip(draft.returnTrip);
        setReturnDate(draft.returnDate);
        setReturnTime(draft.returnTime);
        setAdultPassengers(draft.adultPassengers);
        setChildPassengers(draft.childPassengers);
        setExtraBagSets(draft.extraBagSets);
        setQuoteRequest(Boolean(draft.quoteRequest));
        setDemoRoute(Boolean(draft.demoRoute));
        checkoutAttemptRef.current = draft.checkoutAttemptId;
      } else if (raw) {
        sessionStorage.removeItem(RECOVERY_DRAFT_KEY);
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") === "cancelled") {
        setRecoveryNotice(
          valid
            ? t("payment.cancelledRestored")
            : t("payment.cancelled"),
        );
        window.history.replaceState(
          { waydidiStage: valid && draft ? draft.stage : "search" },
          "",
          window.location.pathname + window.location.hash,
        );
      } else if (valid && draft && draft.stage !== "search") {
        setRecoveryNotice(t("notice.draftRestored"));
      }
    } catch {
      sessionStorage.removeItem(RECOVERY_DRAFT_KEY);
    } finally {
      setDraftReady(true);
    }
    // Restores once per mount. Each language is its own route with its own
    // mount, so the translations this reads cannot change underneath it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Book again" / "Book the return trip" from the customer account arrive as
  // query parameters. Runs after the draft restore so the chosen trip wins.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Remember which travel guide sent the visitor, so the booking can be credited to it.
    const ref = params.get("ref");
    if (ref && /^blog:[a-z0-9-]{1,90}$/.test(ref)) { try { sessionStorage.setItem("waydidi_source", ref); } catch { /* storage blocked */ } }
    const mode = params.get("rebook");
    if (mode !== "again" && mode !== "return") return;
    const count = (key: string, fallback: number) => {
      const value = Number(params.get(key));
      return Number.isInteger(value) && value > 0 && value <= 20 ? value : fallback;
    };
    const passengers = count("passengers", 2);
    const luggage = count("luggage", passengers);
    const hourly = params.get("service") === "hourly";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStage("search");
    setServiceType(hourly ? "hourly" : "transfer");
    setAdultPassengers(passengers);
    setChildPassengers(0);
    setExtraBagSets(Math.max(0, luggage - passengers));
    setBooking((current) => ({
      ...current,
      pickup: params.get("pickup")?.slice(0, 300) ?? current.pickup,
      dropoff: hourly ? current.dropoff : params.get("dropoff")?.slice(0, 300) ?? current.dropoff,
      passengers,
      luggage,
      bookedHours: hourly ? count("hours", current.bookedHours) : current.bookedHours,
    }));
    const vehicle = params.get("vehicle");
    if (vehicle && vehicle in VEHICLES) setVehicle(vehicle);
    setFareQuote(null);
    setReturnFareQuote(null);
    setQuoteSummary(null);
    setHourlyQuote(null);
    setRoutePrefill({ pickupPlaceId: params.get("pickupPlaceId") ?? "", dropoffPlaceId: hourly ? undefined : params.get("dropoffPlaceId") ?? "", nonce: Date.now() });
    window.history.replaceState({ waydidiStage: "search" }, "", window.location.pathname + window.location.hash);
  }, []);

  // Signed-in customers get their saved places (search form) and saved
  // travellers (passenger step). Both endpoints return empty lists otherwise.
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/account/places", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { places: [] })),
      fetch("/api/account/passengers", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { passengers: [] })),
      fetch("/api/account/billing", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { profiles: [] })),
    ]).then(([places, travellers, billing]) => {
      if (!active) return;
      setSavedBilling(billing.profiles ?? []);
      setSavedPlaces(places.places ?? []);
      setSavedTravellers(travellers.passengers ?? []);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  function applySavedPlace(place: { placeId: string; address: string }, as: "pickup" | "dropoff") {
    setPlaceMenu(null);
    setFareQuote(null);
    setReturnFareQuote(null);
    setQuoteSummary(null);
    setHourlyQuote(null);
    change(as, place.address);
    setRoutePrefill(as === "pickup" ? { pickupPlaceId: place.placeId, nonce: Date.now() } : { dropoffPlaceId: place.placeId, nonce: Date.now() });
  }

  useEffect(() => {
    fetch("/api/maps/config", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ apiKey?: string }>)
      .then(({ apiKey }) => {
        setMapsAvailable(Boolean(apiKey));
        // Prototype: with live pricing off, pre-fill the demo route so one tap
        // on See prices opens the map screen. Leaves typed or restored trips alone.
        if (!apiKey && !restoringDraftRef.current) {
          setBooking((current) => current.dropoff === "Grande Centre Point Sukhumvit 55, Bangkok"
            ? { ...current, pickup: "Suvarnabhumi Airport (BKK)", dropoff: "Hilton Pattaya" }
            : current);
          setDepartureSelected(true);
        }
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const restored = (event.state as { waydidiStage?: Stage } | null)?.waydidiStage;
      setStage(restored && restored !== "confirmation" ? restored : "search");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    // Recomputed whenever a picker opens so a tab left open past Bangkok
    // midnight cannot offer a slot that has already gone.
    const earliest = earliestBangkokPickup();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinPickupDate(earliest.date);
    setMinPickupTime(earliest.time);
  }, [dateOpen, returnDateOpen]);

  useEffect(() => {
    if (!draftReady || stage === "confirmation") return;
    const draft: BookingRecoveryDraft = {
      version: 1,
      savedAt: Date.now(),
      stage,
      serviceType,
      booking,
      vehicle,
      payment,
      routeInfo,
      fareQuote,
      returnFareQuote,
      quoteSummary,
      hourlyQuote,
      pickupPlaceId,
      departureSelected,
      returnTrip,
      returnDate,
      returnTime,
      adultPassengers,
      childPassengers,
      extraBagSets,
      checkoutAttemptId: checkoutAttemptRef.current,
      quoteRequest,
      demoRoute,
    };
    try {
      sessionStorage.setItem(RECOVERY_DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Booking still works if private browsing blocks temporary storage.
    }
  }, [
    draftReady,
    stage,
    serviceType,
    booking,
    vehicle,
    payment,
    routeInfo,
    fareQuote,
    returnFareQuote,
    quoteSummary,
    hourlyQuote,
    pickupPlaceId,
    quoteRequest,
    demoRoute,
    departureSelected,
    returnTrip,
    returnDate,
    returnTime,
    adultPassengers,
    childPassengers,
    extraBagSets,
  ]);

  const pricedVehicles = useMemo(
    () =>
      vehicles.map((item) => ({
        ...item,
        passengers: VEHICLES[item.id as VehicleId].passengers,
        bags: VEHICLES[item.id as VehicleId].bags,
        fits: vehicleFits(item.id as VehicleId, booking.passengers, booking.luggage),
        price: hourlyQuote?.prices[item.id]?.total ?? quoteSummary?.prices[item.id]?.total ?? fareQuote?.prices[item.id]?.total ?? item.price,
      })),
    [fareQuote, hourlyQuote, quoteSummary, booking.passengers, booking.luggage],
  );
  const chosenVehicle = useMemo(
    () =>
      pricedVehicles.find((item) => item.id === vehicle) ?? pricedVehicles[0],
    [vehicle, pricedVehicles],
  );
  const discount = promo?.discount ?? 0;
  const tierFree = tierFreeAddons(quoteRequest ? null : memberTier, booking.childSeats, exchangeStop);
  const freeAddons = freeAddonsWithGifts(tierFree, booking.childSeats, exchangeStop, quoteRequest ? { childSeat: false, exchangeStop: false } : vouchers);
  const airportTrip = isAirportPickup(booking.pickup) || isAirportPickup(booking.dropoff);
  const addons = addonsTotal(booking.childSeats, exchangeStop, freeAddons);
  // Member tier discount comes off the fare left after any promo code (the server does the same).
  const memberDiscount = memberTier && !quoteRequest ? tierDiscount(memberTier, Math.max(0, chosenVehicle.price - discount)) : 0;
  const payable = Math.max(0, chosenVehicle.price - discount - memberDiscount) + addons;
  const freeLabel = (amount: number, byTier = false) => (amount > 0 ? `+${money(amount)}` : `Free (${byTier && memberTier ? memberTier.name : "gift"})`);

  // A different car or price needs the code checked again.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears a discount computed for the old price
    setPromo(null);
    setAutoPromoTried(false);
  }, [vehicle, fareQuote?.quoteId, returnFareQuote?.quoteId, hourlyQuote?.quoteId, quoteSummary]);

  // Signed-in members: apply the best coupon from their wallet automatically on the
  // payment step (once per price; a code they typed or removed is left alone).
  const [autoApplied, setAutoApplied] = useState(false);
  useEffect(() => {
    if (stage !== "payment" || !signedIn || promo || promoInput.trim() || autoPromoTried || quoteRequest) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoPromoTried(true);
    fetch("/api/promo/best", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total: chosenVehicle.price, serviceType, returnTrip: serviceType === "transfer" && returnTrip, airportTrip, vehicle, email: booking.email || undefined, phone: booking.phone || undefined }),
    })
      .then((r) => (r.ok ? r.json() : { best: null }))
      .then((data: { best: { code: string; title: string; discount: number } | null }) => {
        if (!data.best) return;
        setPromo({ code: data.best.code, title: data.best.title, discount: data.best.discount });
        setAutoApplied(true);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, signedIn, promo, autoPromoTried, quoteRequest]);

  // A code copied from the homepage ("Copy & Use") is waiting in the box.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("waydidi-promo");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads a saved code after hydration
      if (saved) setPromoInput(saved);
    } catch { /* storage unavailable */ }
  }, []);

  async function applyPromo() {
    const code = promoInput.trim();
    if (!code) { setPromoError("Enter a promo code."); return; }
    setPromoChecking(true);
    setPromoError("");
    try {
      const response = await fetch("/api/promo/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, total: chosenVehicle.price, serviceType, returnTrip: serviceType === "transfer" && returnTrip, airportTrip, vehicle, email: booking.email || undefined, phone: booking.phone || undefined }),
      });
      const result = (await response.json()) as { ok: boolean; code?: string; title?: string; discount?: number; reason?: string };
      if (!result.ok || !result.code || !result.discount) { setPromo(null); setPromoError(result.reason ?? "This promo code isn't valid."); return; }
      setPromo({ code: result.code, title: result.title ?? result.code, discount: result.discount });
      setAutoApplied(false);
      try { sessionStorage.removeItem("waydidi-promo"); } catch { /* ignore */ }
    } catch {
      setPromoError("Couldn't check the code. Please try again.");
    } finally {
      setPromoChecking(false);
    }
  }
  const change = <K extends keyof Booking>(key: K, value: Booking[K]) => {
    setBooking((current) => ({ ...current, [key]: value }));
    if (["name", "surname", "email", "phone", "termsAccepted"].includes(String(key))) {
      setFieldErrors((current) => ({ ...current, [key]: undefined }));
    }
  };

  // Each booking step gets its own history entry, so the browser Back button
  // steps back through the flow instead of abandoning the booking.
  function goToStage(
    next: Stage,
    { replace = false, scroll = true }: { replace?: boolean; scroll?: boolean } = {},
  ) {
    setStage(next);
    try {
      const entry = { waydidiStage: next };
      if (replace) window.history.replaceState(entry, "");
      else window.history.pushState(entry, "");
    } catch {
      // Navigation still works if the history API is unavailable.
    }
    if (scroll) window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Step 1 (details) checks the lead passenger only; terms come on step 2.
  function continueToPayment() {
    const { termsAccepted: _terms, ...errors } = validateBookingReview({ ...booking, termsAccepted: true });
    void _terms;
    setFieldErrors(errors);
    const firstField = Object.keys(errors)[0];
    if (firstField) {
      window.setTimeout(() => document.querySelector<HTMLElement>(`[data-booking-field="${firstField}"]`)?.focus(), 0);
      return;
    }
    setError("");
    goToStage("payment");
  }

  function continueToReview() {
    const errors = validateBookingReview(booking);
    // Passenger fields live on step 1: send the customer back there to fix them.
    if (Object.keys(errors).some((key) => key !== "termsAccepted")) {
      setFieldErrors(errors);
      goToStage("details");
      return;
    }
    setFieldErrors(errors);
    const firstField = Object.keys(errors)[0];
    if (firstField) {
      window.setTimeout(() => {
        document.querySelector<HTMLElement>(`[data-booking-field="${firstField}"]`)?.focus();
      }, 0);
      return;
    }
    setError("");
    goToStage("review");
  }
  // When the group outgrows the chosen vehicle, move to the smallest one that fits.
  const fitVehicleToGroup = (passengers: number, bags: number) =>
    setVehicle((current) =>
      vehicleFits(current as VehicleId, passengers, bags)
        ? current
        : smallestFittingVehicle(passengers, bags) ?? current,
    );
  const changeAdults = (value: number) => {
    const adults = Math.max(1, value);
    fitVehicleToGroup(adults + childPassengers, adults + childPassengers + extraBagSets);
    setAdultPassengers(adults);
    setBooking((current) => ({
      ...current,
      passengers: adults + childPassengers,
      luggage: adults + childPassengers + extraBagSets,
    }));
  };
  const changeChildren = (value: number) => {
    const children = Math.max(0, value);
    setChildPassengers(children);
    fitVehicleToGroup(adultPassengers + children, adultPassengers + children + extraBagSets);
    setBooking((current) => ({
      ...current,
      passengers: adultPassengers + children,
      luggage: adultPassengers + children + extraBagSets,
    }));
  };

  // Return added from the results screen: re-run the search for the round trip
  // (same pickup and drop-off, reversed for the return).
  useEffect(() => {
    if (!requoteReturn || !returnTrip) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRequoteReturn(false);
    void search({ preventDefault() {} } as FormEvent<HTMLFormElement>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requoteReturn, returnTrip]);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!navigator.onLine) {
      setPricingMessage(t("search.offline"));
      return;
    }
    if (!departureSelected) {
      setPricingMessage(t("search.chooseDeparture"));
      setDateOpen(true);
      return;
    }
    if (!mapsAvailable) {
      const needsDropoff = serviceType === "transfer";
      if (booking.pickup.trim().length < 3 || (needsDropoff && booking.dropoff.trim().length < 3)) {
        setPricingMessage(t(needsDropoff ? "search.enterAddresses" : "search.enterPickup"));
        return;
      }
      setPricingMessage("");
      setQuoteRequest(true);
      const demo = serviceType === "transfer" && isDemoRoute(booking.pickup, booking.dropoff);
      setDemoRoute(demo);
      if (demo) {
        setFareQuote(null);
        goToStage("vehicle");
        const route = await fetchDemoRoute();
        setFareQuote({
          quoteId: "demo",
          area: { id: "demo", name: "Prototype", color: "#FF8A05", pricingType: "demo" },
          distanceMeters: route.distanceMeters,
          durationSeconds: route.durationSeconds,
          path: route.path,
          pickup: DEMO_PICKUP,
          dropoff: DEMO_DROPOFF,
          prices: Object.fromEntries(Object.entries(DEMO_PRICES).map(([id, total]) => [id, { total, basePrice: total, distanceSurcharge: 0 }])),
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        });
        // Prototype round trip: the return leg reuses the sample route and prices.
        if (returnTrip) {
          const journey = (quoteId: string, pickup: string, dropoff: string, date: string, time: string): QuoteJourney => ({ quoteId, pickup, dropoff, departureDate: date, departureTime: time, timezone: "Asia/Bangkok", distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds });
          setReturnFareQuote({
            quoteId: "demo-return",
            area: { id: "demo", name: "Prototype", color: "#FF8A05", pricingType: "demo" },
            distanceMeters: route.distanceMeters,
            durationSeconds: route.durationSeconds,
            path: [...route.path].reverse(),
            pickup: DEMO_DROPOFF,
            dropoff: DEMO_PICKUP,
            prices: Object.fromEntries(Object.entries(DEMO_PRICES).map(([id, total]) => [id, { total, basePrice: total, distanceSurcharge: 0 }])),
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          });
          setQuoteSummary({
            currency: "THB",
            outbound: journey("demo", booking.pickup, booking.dropoff, booking.date, booking.time),
            return: journey("demo-return", booking.dropoff, booking.pickup, returnDate, returnTime),
            prices: Object.fromEntries(Object.entries(DEMO_PRICES).map(([id, total]) => [id, { outbound: total, return: total, total: total * 2 }])),
          });
        } else {
          setReturnFareQuote(null);
          setQuoteSummary(null);
        }
        return;
      }
      goToStage("vehicle");
      return;
    }
    setQuoteRequest(false);
    if (serviceType === "transfer" && (!routeInfo?.pickupPlaceId || !routeInfo.dropoffPlaceId)) {
      setPricingMessage(t("search.selectBoth"));
      return;
    }
    if (serviceType === "hourly" && !hourlyQuote) {
      if (!pickupPlaceId) { setPricingMessage(t("search.selectPickup")); return; }
      try {
        setLoading(true); setPricingMessage("");
        const response = await fetch("/api/hourly-quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pickupPlaceId,bookedHours:booking.bookedHours,pickupDate:booking.date,pickupTime:booking.time,timezone:"Asia/Bangkok"})});
        const result = await response.json() as HourlyQuote & {error?:string};
        if (!response.ok) { setPricingMessage(result.error??t("search.hourlyUnavailable")); return; }
        setHourlyQuote(result);
      } catch { setPricingMessage(t("search.hourlyTempUnavailable")); return; }
      finally { setLoading(false); }
    }
    if (serviceType === "transfer") {
      if (routeInfo?.pickupPlaceId && routeInfo.dropoffPlaceId) {
        const ready = await calculateTransferQuotes(routeInfo);
        if (!ready) return;
      }
    }
    goToStage("vehicle");
  }

  async function handleRouteChange(info: RouteInfo | null) {
    setRouteInfo(info);
    setFareQuote(null);
    setReturnFareQuote(null);
    setQuoteSummary(null);
    setPricingMessage("");
    if (!info?.pickupPlaceId || !info.dropoffPlaceId) return;
    try {
      setRouteLoading(true);
      const response = await fetch("/api/fare-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupPlaceId: info.pickupPlaceId,
          dropoffPlaceId: info.dropoffPlaceId,
          pickupDate: booking.date,
          pickupTime: booking.time,
          timezone: "Asia/Bangkok",
        }),
      });
      const result = (await response.json()) as FareQuote & { error?: string };
      if (!response.ok) {
        setPricingMessage(result.error ?? t("search.customQuote"));
        return;
      }
      setFareQuote(result);
    } catch {
      setPricingMessage(t("search.routeUnavailable"));
    } finally {
      setRouteLoading(false);
    }
  }

  async function requestFareQuote(input: {
    pickupPlaceId: string;
    dropoffPlaceId: string;
    pickupDate: string;
    pickupTime: string;
  }) {
    const response = await fetch("/api/fare-quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, timezone: "Asia/Bangkok" }),
    });
    const result = (await response.json()) as FareQuote & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "This route needs a custom quote.");
    return result;
  }

  async function requestQuoteSummary(outboundQuoteId: string, returnQuoteId?: string) {
    const response = await fetch("/api/booking/quote-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outboundQuoteId, returnQuoteId }),
    });
    const result = (await response.json()) as QuoteSummary & { error?: string };
    if (!response.ok) throw new Error(result.error ?? "The journey total is unavailable.");
    return result;
  }

  async function calculateTransferQuotes(info: RouteInfo) {
    setRouteLoading(true);
    setPricingMessage("");
    setQuoteSummary(null);
    try {
      const outboundPromise = requestFareQuote({
        pickupPlaceId: info.pickupPlaceId,
        dropoffPlaceId: info.dropoffPlaceId,
        pickupDate: booking.date,
        pickupTime: booking.time,
      });
      const returnPromise = returnTrip
        ? requestFareQuote({
            pickupPlaceId: info.dropoffPlaceId,
            dropoffPlaceId: info.pickupPlaceId,
            pickupDate: returnDate,
            pickupTime: returnTime,
          })
        : null;
      const [outboundResult, returnResult] = await Promise.allSettled([
        outboundPromise,
        returnPromise ?? Promise.resolve(null),
      ]);
      if (outboundResult.status === "rejected") {
        setFareQuote(null);
        setPricingMessage(outboundResult.reason instanceof Error ? outboundResult.reason.message : "The outbound journey is unavailable.");
        return false;
      }
      setFareQuote(outboundResult.value);
      if (returnResult.status === "rejected") {
        setReturnFareQuote(null);
        setPricingMessage(returnResult.reason instanceof Error ? `Outbound ready. Return: ${returnResult.reason.message}` : "Outbound ready, but the return journey is unavailable.");
        return false;
      }
      const returnQuote = returnResult.value;
      setReturnFareQuote(returnQuote);
      const summary = await requestQuoteSummary(outboundResult.value.quoteId, returnQuote?.quoteId);
      setQuoteSummary(summary);
      return true;
    } catch (reason) {
      setPricingMessage(reason instanceof Error ? reason.message : "Journey pricing is temporarily unavailable.");
      return false;
    } finally {
      setRouteLoading(false);
    }
  }

  async function retryRoute() {
    if (routeInfo) await calculateTransferQuotes(routeInfo);
  }

  async function confirmBooking() {
    if (loading) return;
    if (!navigator.onLine) {
      setError("You are offline. Your details are saved in this tab—reconnect and try again.");
      return;
    }
    const reviewErrors = validateBookingReview(booking);
    const firstInvalidField = Object.keys(reviewErrors)[0];
    if (firstInvalidField) {
      setFieldErrors(reviewErrors);
      setError("");
      goToStage("payment", { scroll: false });
      window.setTimeout(() => {
        document.querySelector<HTMLElement>(`[data-booking-field="${firstInvalidField}"]`)?.focus();
      }, 0);
      return;
    }
    setLoading(true);
    setError("");
    if (!checkoutAttemptRef.current) checkoutAttemptRef.current = crypto.randomUUID();
    try {
      const stored = sessionStorage.getItem(RECOVERY_DRAFT_KEY);
      if (stored) {
        const draft = JSON.parse(stored) as BookingRecoveryDraft;
        sessionStorage.setItem(
          RECOVERY_DRAFT_KEY,
          JSON.stringify({ ...draft, savedAt: Date.now(), checkoutAttemptId: checkoutAttemptRef.current }),
        );
      }
    } catch {
      // The server still protects checkout retries when storage is unavailable.
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          checkoutAttemptId: checkoutAttemptRef.current,
          customerName: booking.name,
          customerSurname: booking.surname,
          customerEmail: booking.email,
          customerPhone: booking.phone,
          flightNumber: booking.flightNumber,
          pickupSign: booking.pickupSign,
          pickupInstructions: booking.pickupInstructions,
          childSeats: booking.childSeats,
          exchangeStop,
          copyEmail: booking.copyEmail?.trim() || undefined,
          source: (() => { try { return sessionStorage.getItem("waydidi_source") || undefined; } catch { return undefined; } })(),
          saveBilling: Boolean(booking.taxInvoice && saveBilling && signedIn),
          taxInvoice: booking.taxInvoice ? { name: (booking.taxName ?? "").trim(), taxId: (booking.taxId ?? "").replace(/[\s-]/g, ""), branch: (booking.taxBranch ?? "").trim() || "Head office", address: (booking.taxAddress ?? "").trim() } : undefined,
          oversizedLuggage: booking.oversizedLuggage,
          specialRequests: [exchangeStop ? "Currency exchange stop requested." : "", booking.specialRequests].filter(Boolean).join(" ").slice(0, 500),
          termsAccepted: booking.termsAccepted,
          pickup: booking.pickup,
          dropoff: booking.dropoff,
          pickupDate: booking.date,
          pickupTime: booking.time,
          timezone: "Asia/Bangkok",
          passengers: booking.passengers,
          luggage: booking.luggage,
          vehicle,
          paymentMethod: payable === 0 ? "cash" : payment,
          fareQuoteId: fareQuote?.quoteId,
          returnFareQuoteId: returnTrip ? returnFareQuote?.quoteId : undefined,
          returnDate: returnTrip ? returnDate : undefined,
          returnTime: returnTrip ? returnTime : undefined,
          serviceType,
          bookedHours: serviceType === "hourly" ? booking.bookedHours : undefined,
          hourlyQuoteId: hourlyQuote?.quoteId,
          promoCode: promo?.code,
        }),
      });
      const result = (await response.json()) as {
        checkoutUrl?: string;
        error?: string;
        code?: string;
        retryable?: boolean;
      };
      if (result.code === "IDEMPOTENCY_CONFLICT") checkoutAttemptRef.current = "";
      if (
        !response.ok &&
        ["QUOTE_MISMATCH", "RETURN_QUOTE_MISSING", "RETURN_QUOTE_MISMATCH"].includes(result.code ?? "") &&
        routeInfo
      ) {
        checkoutAttemptRef.current = "";
        const refreshed = await calculateTransferQuotes(routeInfo);
        goToStage("vehicle", { scroll: false });
        setError("");
        setPricingMessage(
          refreshed
            ? "Your latest journey price is ready. Please review it and continue again."
            : (result.error ?? "Please calculate your journey again."),
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      if (!response.ok && result.code === "PROMO_INVALID") {
        checkoutAttemptRef.current = "";
        setPromo(null);
        setPromoError(result.error ?? "This promo code isn't valid.");
        goToStage("payment");
        return;
      }
      if (!response.ok || !result.checkoutUrl)
        throw new Error(result.error ?? "Checkout could not start");
      window.location.assign(result.checkoutUrl);
    } catch (reason) {
      setError(
        reason instanceof DOMException && reason.name === "AbortError"
          ? "Checkout is taking longer than expected. Your booking details are safe—tap the button again to continue."
          : !navigator.onLine
          ? "Your connection dropped. Your details are saved in this tab—reconnect and try again."
          : reason instanceof Error
          ? reason.message
          : "We could not confirm your booking.",
      );
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  }

  // Mobile keeps the total and the next step on screen; the booking summary
  // otherwise sits below the whole form. Each step's own rules decide when its
  // button is enabled, so the bar can never skip one.
  const hasPrice = !quoteRequest && (serviceType === "transfer" ? Boolean(fareQuote) : Boolean(hourlyQuote));
  const priceText = quoteRequest ? "Quote on request" : hasPrice ? money(payable) : "—";
  useEffect(() => {
    if (!returnToTripEdit || peopleOpen || dateOpen) return;
    // A picker opened from the edit popup has closed: show the popup again.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReturnToTripEdit(false);
    setTripEditOpen(true);
  }, [returnToTripEdit, peopleOpen, dateOpen]);

  // The transfer results screen has its own full-screen layout and Book bar.
  const mapView = stage === "vehicle" && serviceType === "transfer" && (!quoteRequest || demoRoute);
  const priceBar =
    mapView ? null : stage === "vehicle"
      ? {
          label: chosenVehicle.name,
          action: "Continue",
          onClick: () => goToStage("details"),
          disabled: !chosenVehicle.fits
            ? true
            : quoteRequest
            ? false
            : serviceType === "transfer"
              ? !fareQuote || routeLoading || (returnTrip && !(returnFareQuote && quoteSummary))
              : !hourlyQuote,
        }
      : stage === "payment"
        ? { label: chosenVehicle.name, action: "Review booking", onClick: continueToReview, disabled: !isOnline }
        : stage === "review" && quoteRequest
          ? {
              label: chosenVehicle.name,
              action: "Contact us",
              onClick: () => window.location.assign("/contact"),
              disabled: false,
            }
        : stage === "review"
          ? {
              label: chosenVehicle.name,
              action: loading ? "Verifying…" : payment === "cash" ? "Confirm booking" : "Confirm and pay",
              onClick: confirmBooking,
              disabled: loading || !isOnline,
            }
          : null;

  // The search box rows; reused by the "Edit" sheet on the results screen.
  const searchCard = (compact: boolean) => (
              <div className={compact ? "overflow-visible rounded-[22px] bg-white text-slate-950" : `mt-2.5 overflow-visible rounded-[22px] bg-white p-2.5 text-slate-950 shadow-xl shadow-slate-900/10 lg:mt-0 lg:grid lg:items-end lg:gap-3 lg:rounded-tl-none lg:p-6 ${serviceType === "hourly" ? "lg:grid-cols-[.42fr_1.55fr_1.4fr_.58fr_auto]" : "lg:grid-cols-[.42fr_1.15fr_1.15fr_1.55fr_auto]"}`}>
                <div className={`flex w-full flex-col gap-2 overflow-visible rounded-[18px] bg-white ${compact ? "" : "lg:contents lg:w-auto"}`}>
                <button
                  type="button"
                  onClick={() => setPeopleOpen(true)}
                  className="order-1 flex min-h-14 w-full items-center justify-between rounded-[14px] border border-slate-200 bg-white px-4 py-2 text-left lg:order-none lg:px-5 lg:min-h-[88px] lg:rounded-xl lg:border-0 lg:bg-[#F4F4F4]"
                  aria-expanded={peopleOpen}
                  aria-controls="passenger-luggage-sheet"
                  aria-label={t("hero.travellersLabel", { passengers: booking.passengers, bags: booking.luggage })}
                >
                  <span className="flex items-center gap-3.5 text-[15px]/[24px] font-normal text-slate-950 lg:text-[15px]/[24px]">
                    <span className="flex items-center gap-3">
                      <Users size={20} className="shrink-0" aria-hidden="true" /> {booking.passengers}
                    </span>
                    <span className="flex items-center gap-2">
                      <Luggage size={20} className="shrink-0" aria-hidden="true" /> {booking.luggage}
                    </span>
                  </span>
                  <ChevronDown
                    className={`transition-transform duration-300 ${peopleOpen ? "rotate-180" : ""}`}
                    size={19}
                    aria-hidden="true"
                  />
                </button>
                <GoogleRoutePicker
                  pickup={booking.pickup}
                  dropoff={booking.dropoff}
                  onPickupChange={(value) => {
                    change("pickup", value);
                    setFareQuote(null);
                    setReturnFareQuote(null);
                    setQuoteSummary(null);
                  }}
                  onDropoffChange={(value) => {
                    change("dropoff", value);
                    setFareQuote(null);
                    setReturnFareQuote(null);
                    setQuoteSummary(null);
                  }}
                  onRouteChange={handleRouteChange}
                  pickupOnly={serviceType === "hourly"}
                  onPickupPlaceChange={(id)=>{setPickupPlaceId(id);setHourlyQuote(null);}}
                  prefill={routePrefill}
                  connectedMobile
                />
                <div className={`order-4 grid min-h-14 ${serviceType === "transfer" ? "grid-cols-2" : "grid-cols-1"} overflow-hidden rounded-[14px] border border-slate-200 bg-white lg:order-none lg:min-h-[88px] lg:rounded-xl lg:border-0 lg:bg-[#F4F4F4]`}>
                  <div className={`relative flex min-w-0 items-center ${serviceType === "transfer" ? "border-r border-slate-200" : ""}`}>
                    <button
                      type="button"
                      onClick={() => setDateOpen(true)}
                      className="flex h-full min-w-0 flex-1 items-center gap-3 py-2 pl-4 pr-1.5 text-left lg:px-5"
                      aria-expanded={dateOpen}
                    >
                      {departureSelected ? <DepartureIcon /> : <CalendarDays className="shrink-0 text-slate-950" size={20} />}
                      {departureSelected ? (
                        <span className="min-w-0 font-normal text-slate-950">
                          <span className="block truncate text-[14px] leading-[21px] tracking-[-.01em] max-[359px]:text-[13px]">{shortDate(booking.date, locale)}</span>
                          <span className="block text-[13px] leading-[18px]">{formatTimeLabel(booking.time, locale)}</span>
                        </span>
                      ) : (
                        <span className="text-[15px]/[24px] font-normal text-slate-600 lg:text-[15px]/[24px]">{t("hero.departure")}</span>
                      )}
                    </button>
                    {departureSelected && (
                      <button
                        type="button"
                        onClick={() => {
                          setDepartureSelected(false);
                          setReturnTrip(false);
                          setReturnDateOpen(false);
                          setFareQuote(null);
                          setReturnFareQuote(null);
                          setQuoteSummary(null);
                        }}
                        className="mr-2 grid size-6 shrink-0 place-items-center rounded-full text-white"
                        aria-label={t("hero.removeDeparture")}
                      >
                        <span className="grid size-5 place-items-center rounded-full bg-[#8E8E93] transition hover:bg-slate-600"><X size={12} strokeWidth={3} /></span>
                      </button>
                    )}
                  </div>
                  {serviceType === "transfer" ? (
                    <div className="relative flex min-w-0 items-center">
                    <button
                      type="button"
                      disabled={!departureSelected}
                      onClick={() => {
                        if (!returnTrip) {
                          setReturnDate(booking.date);
                          setReturnTime(booking.time);
                        }
                        setReturnDateOpen(true);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch px-2.5 py-2 text-left text-slate-500 transition enabled:hover:bg-orange-50 disabled:cursor-not-allowed disabled:text-slate-300 sm:px-3.5"
                      aria-label={returnTrip ? t("hero.editReturnLabel") : t("hero.addReturnLabel")}
                    >
                      {returnTrip ? (
                        <CalendarDays className="shrink-0 text-slate-950" size={20} />
                      ) : (
                        <Plus className="shrink-0" size={20} />
                      )}
                      <span className="min-w-0">
                        {returnTrip ? (
                          <>
                            <span className="block truncate text-[14px] font-normal leading-[21px] tracking-[-.01em] text-slate-950 max-[359px]:text-[13px]">{shortDate(returnDate, locale)}</span>
                            <span className="block text-[13px] font-normal leading-[18px] text-slate-950">{formatTimeLabel(returnTime, locale)}</span>
                          </>
                        ) : (
                          <span className="text-[15px]/[24px] font-normal">{t("hero.addReturn")}</span>
                        )}
                      </span>
                    </button>
                    {returnTrip && (
                      <button
                        type="button"
                        onClick={() => {
                          setReturnTrip(false);
                          setReturnFareQuote(null);
                          setQuoteSummary(null);
                        }}
                        className="ml-auto mr-2 grid size-6 shrink-0 place-items-center rounded-full text-white"
                        aria-label={t("hero.removeReturn")}
                      >
                        <span className="grid size-5 place-items-center rounded-full bg-[#8E8E93] transition hover:bg-slate-600"><X size={12} strokeWidth={3} /></span>
                      </button>
                    )}
                    </div>
                  ) : null}
                </div>
                {serviceType === "hourly" && <label className="order-5 flex min-h-14 items-center gap-2.5 rounded-[14px] border border-slate-200 bg-white px-3.5 py-2 lg:order-none lg:mt-0 lg:min-h-[88px] lg:rounded-xl lg:border-0 lg:bg-[#F4F4F4]"><Clock3 size={18}/><span className="w-full"><span className="block text-[13px]/[20px] font-normal text-slate-500">{t("hero.duration")}</span><select value={booking.bookedHours} onChange={(e)=>{change("bookedHours",Number(e.target.value));setHourlyQuote(null);}} className="w-full bg-transparent text-base font-normal outline-none">{Array.from({length:10},(_,i)=>i+3).map(hours=><option key={hours} value={hours}>{t("hero.hours", { count: hours })}</option>)}</select></span></label>}
                </div>
                <div className="mt-2.5 flex items-center lg:mt-0">
                  <button
                    className="flex min-h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-[14px] bg-brand px-8 text-[15px]/[24px] font-semibold text-white shadow-lg shadow-orange-900/20 transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 lg:min-h-[88px] lg:w-auto lg:rounded-xl"
                    type="submit"
                  >
                    {loading ? t("hero.calculating") : t("hero.seePrices")} <ArrowRight size={18} />
                  </button>
                </div>
              </div>
  );

  return (
    <I18nProvider locale={locale} messages={messages}>
    <main className="font-home min-h-screen bg-white text-ink">
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed inset-x-4 ${priceBar ? "bottom-24 lg:bottom-4" : "bottom-4"} z-[70] mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-ink px-5 py-4 text-sm font-semibold text-white shadow-2xl`}
        >
          <WifiOff className="shrink-0 text-[#FFB45E]" size={20} />
          <span>{t("notice.offline")}</span>
        </div>
      )}
      {isOnline && recoveryNotice && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed inset-x-4 ${priceBar ? "bottom-24 lg:bottom-4" : "bottom-4"} z-[70] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-orange-200 bg-white px-5 py-4 text-sm font-semibold text-ink shadow-2xl`}
        >
          <RefreshCw className="shrink-0 text-brand-deep" size={20} />
          <span className="flex-1">{recoveryNotice}</span>
          <button
            type="button"
            onClick={() => setRecoveryNotice("")}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-50 text-brand-deep"
            aria-label={t("notice.dismiss")}
          >
            <X size={18} />
          </button>
        </div>
      )}
      <section
        className={`relative ${stage === "search" ? "overflow-hidden bg-brand text-white" : "bg-white text-ink"}`}
      >
        {stage === "search" ? (
          <SiteHeader overlay />
        ) : mapView ? null : (
          <header className="relative z-40 flex h-[72px] w-full items-center justify-between bg-brand px-5 text-ink lg:px-8">
            <Link href="/" className="inline-flex text-white" aria-label={t("nav.home")}>
              <WaydidiLogo className="h-[47px] w-auto sm:h-[58px]" />
            </Link>
          </header>
        )}

        {stage === "search" && (
          <>
            {/* Large screens only: the photo is decorative and too costly for mobile data. */}
            {/* Starts below the 97px header so the nav always sits on solid
                orange. The masks fade the photo itself into the orange, left and
                top, rather than stacking overlay layers on it. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 right-0 top-[97px] hidden w-[54%] [mask-composite:intersect] [mask-image:linear-gradient(to_right,transparent,black_45%),linear-gradient(to_bottom,transparent,black_64px)] lg:block"
            >
              <Image
                src="/hero-driver-customer.webp"
                alt=""
                fill
                priority
                // The Worker has no Cloudflare Images binding, so the
                // optimizer route would fail; serve the file as-is.
                unoptimized
                className="object-cover object-[38%_20%]"
              />
            </div>
          </>
        )}
        {stage === "search" && (
          <div className="relative z-10 w-full px-5 pb-12 pt-[98px] animate-in fade-in duration-300 motion-reduce:animate-none lg:px-6 lg:pb-18 lg:pt-[160px]">
            <div className="mb-6 max-w-2xl">
              <h1 className={`${locale === "en" ? "" : "text-balance "}text-[32.5px] font-semibold leading-[1.08] tracking-[-.03em] sm:text-[45.3px] lg:text-[51.7px]`}>
                {t("hero.title")}
              </h1>
              <p className="mt-3 text-[17px]/[28px] font-medium text-white sm:text-[19px]/[28px] lg:text-[23px]/[32px]">
                {t("hero.subtitle")}
              </p>
            </div>
            <form id="booking-search" onSubmit={search} className="font-search w-full scroll-mt-28">
              <div className="inline-grid h-[46px] w-[min(270px,100%)] grid-cols-2 gap-1 rounded-[15px] bg-white p-1 text-[14px] font-medium text-slate-500 shadow-md shadow-orange-950/10 lg:inline-flex lg:h-auto lg:w-auto lg:rounded-b-none lg:rounded-t-[26px] lg:p-1.5 lg:pb-0 lg:text-[15px]/[24px] lg:shadow-none">
                <button onClick={()=>{setServiceType("transfer");setHourlyQuote(null);}} type="button" className={`flex min-w-0 items-center justify-center gap-1.5 rounded-[12px] px-2.5 transition lg:min-h-12 lg:gap-2 lg:rounded-full lg:px-6 lg:py-3 ${serviceType === "transfer" ? "bg-brand text-white" : "hover:bg-orange-50 hover:text-slate-900"}`}>
                  <CarFront className="size-[17px] lg:size-[19px]" aria-hidden="true" /> {t("hero.transfer")}
                </button>
                <button onClick={()=>{setServiceType("hourly");setFareQuote(null);setPricingMessage("");}} className={`flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] px-2.5 transition lg:min-h-12 lg:gap-2 lg:rounded-full lg:px-6 lg:py-3 ${serviceType === "hourly" ? "bg-brand text-white" : "hover:bg-orange-50 hover:text-slate-900"}`} type="button">
                  <Clock3 className="size-[17px] lg:size-[19px]" aria-hidden="true" /> {t("hero.hourly")}
                </button>
              </div>
              {searchCard(false)}
              <DateTimePicker
                open={dateOpen}
                kind="departure"
                date={booking.date}
                time={booking.time}
                onDateChange={(value) => { change("date", value); setFareQuote(null); setReturnFareQuote(null); setQuoteSummary(null); }}
                onTimeChange={(value) => { change("time", value); setFareQuote(null); setReturnFareQuote(null); setQuoteSummary(null); }}
                min={minPickupDate}
                minTime={minPickupTime}
                onOpenChange={setDateOpen}
                onDone={() => {
                  setDepartureSelected(true);
                  setDateOpen(false);
                  setPricingMessage("");
                }}
              />
              <DateTimePicker
                open={returnDateOpen}
                kind="return"
                date={returnDate}
                time={returnTime}
                onDateChange={(value) => { setReturnDate(value); setReturnFareQuote(null); setQuoteSummary(null); }}
                onTimeChange={(value) => { setReturnTime(value); setReturnFareQuote(null); setQuoteSummary(null); }}
                min={booking.date}
                minTime={booking.time}
                onOpenChange={setReturnDateOpen}
                onDone={() => {
                  setReturnTrip(true);
                  setReturnDateOpen(false);
                }}
              />
              {savedPlaces.length > 0 && (
                // Signed-in customers: tap a saved place, then choose pickup or drop-off.
                <div className="mt-3 flex flex-wrap items-center gap-2" aria-label={t("saved.places")}>
                  <span className="text-sm font-medium text-white/90">{t("saved.places")}:</span>
                  {savedPlaces.map((place) => (
                    <span key={place.id} className="relative">
                      <button
                        type="button"
                        onClick={() => setPlaceMenu(placeMenu === place.id ? null : place.id)}
                        aria-expanded={placeMenu === place.id}
                        title={place.address}
                        className="inline-flex max-w-[200px] items-center gap-1.5 rounded-full bg-white/95 px-3.5 py-2 text-sm font-medium text-slate-800 shadow-sm hover:bg-white"
                      >
                        <MapPin size={15} className="shrink-0 text-brand" aria-hidden="true" />
                        <span className="truncate">{place.label}</span>
                      </button>
                      {placeMenu === place.id && (
                        <span className="absolute left-0 top-full z-30 mt-2 grid w-48 rounded-2xl bg-white p-1.5 text-sm text-slate-800 shadow-xl">
                          <button type="button" onClick={() => applySavedPlace(place, "pickup")} className="rounded-xl px-3 py-2.5 text-left hover:bg-orange-50">{t("saved.setPickup")}</button>
                          {serviceType !== "hourly" && <button type="button" onClick={() => applySavedPlace(place, "dropoff")} className="rounded-xl px-3 py-2.5 text-left hover:bg-orange-50">{t("saved.setDropoff")}</button>}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              )}
              {!fareQuote && pricingMessage && (
                <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
                  {pricingMessage}
                </div>
              )}
              {hourlyQuote && <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-800"><span className="size-3 rounded-full bg-brand"/><strong>{t("hero.hourlyDriverSummary", { hours: hourlyQuote.bookedHours })}</strong><span>{hourlyQuote.area.name}</span><span className="text-slate-500">{t("hero.includesKm", { km: Math.round((hourlyQuote.prices.economy_sedan?.includedDistanceMeters??0)/1000) })} · {t("legal.priceLocked")}</span></div>}
            </form>
          </div>
        )}
      </section>

      {stage === "vehicle" && (
        <>
          {/* "Edit" on the results screen: the homepage search box, without the service tabs. */}
          <Sheet open={routeEditOpen} onOpenChange={(open) => { if (!open && (dateOpen || returnDateOpen || peopleOpen)) return; setRouteEditOpen(open); }}>
            <SheetContent
              side="bottom"
              showCloseButton={false}
              className="font-search max-h-[92dvh] overflow-y-auto rounded-t-[28px] border-0 bg-white px-4 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 text-ink sm:px-6 lg:left-1/2 lg:max-w-xl lg:-translate-x-1/2"
            >
              <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300" aria-hidden="true" />
              <SheetHeader className="flex-row items-center justify-between px-0 pb-2 pt-4 text-left">
                <SheetTitle className="font-home text-2xl font-semibold tracking-[-.02em]">{t("edit.title")}</SheetTitle>
                <button type="button" onClick={() => setRouteEditOpen(false)} className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-700" aria-label="Close"><X size={20} /></button>
              </SheetHeader>
              <form onSubmit={(event) => { setRouteEditOpen(false); void search(event); }}>
                {searchCard(true)}
              </form>
            </SheetContent>
          </Sheet>
          <Sheet open={tripEditOpen} onOpenChange={setTripEditOpen}>
            <SheetContent
              side="bottom"
              showCloseButton={false}
              className="font-home rounded-t-[28px] border-0 bg-white px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 text-ink sm:px-8 lg:left-1/2 lg:max-w-xl lg:-translate-x-1/2"
            >
              <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300" aria-hidden="true" />
              <SheetHeader className="flex-row items-center justify-between px-0 pb-1 pt-4 text-left">
                <SheetTitle className="text-2xl font-semibold tracking-[-.02em]">{t("edit.title")}</SheetTitle>
                <button type="button" onClick={() => setTripEditOpen(false)} className="grid size-10 place-items-center rounded-full bg-slate-100 text-slate-700" aria-label="Close"><X size={20} /></button>
              </SheetHeader>
              {/* Same rows as the homepage search box. */}
              <div className="mt-2 grid gap-2 rounded-[22px] bg-white">
                <button type="button" onClick={() => { setTripEditOpen(false); setReturnToTripEdit(true); setPeopleOpen(true); }} className="flex min-h-14 w-full items-center justify-between rounded-[14px] border border-slate-200 bg-white px-4 py-2 text-left">
                  <span className="flex items-center gap-3.5 text-base text-slate-950">
                    <span className="flex items-center gap-3"><Users size={20} className="shrink-0" aria-hidden="true" /> {booking.passengers}</span>
                    <span className="flex items-center gap-2"><Luggage size={20} className="shrink-0" aria-hidden="true" /> {booking.luggage}</span>
                  </span>
                  <ChevronDown aria-hidden="true" />
                </button>
                <button type="button" onClick={() => { setTripEditOpen(false); setReturnToTripEdit(true); setDateOpen(true); }} className="flex min-h-14 w-full items-center gap-3 rounded-[14px] border border-slate-200 bg-white px-4 py-2 text-left">
                  <DepartureIcon />
                  <span className="min-w-0 text-slate-950">
                    <span className="block text-[16px] leading-[21px]">{shortDate(booking.date, locale)}</span>
                    <span className="block text-[14px] leading-[18px]">{formatTimeLabel(booking.time, locale)}</span>
                  </span>
                  <ChevronDown className="ml-auto" aria-hidden="true" />
                </button>
              </div>
              <button
                type="button"
                onClick={async () => {
                  setTripEditOpen(false);
                  // Live pricing depends on the pickup time, so re-quote; the
                  // prototype route keeps its sample prices.
                  if (!demoRoute && routeInfo?.pickupPlaceId && routeInfo.dropoffPlaceId) await calculateTransferQuotes(routeInfo);
                }}
                className="mt-4 flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-brand text-base font-semibold text-white shadow-lg shadow-orange-900/20 transition hover:bg-brand-hover"
              >
                Update trip
              </button>
            </SheetContent>
          </Sheet>
          <DateTimePicker
            open={dateOpen}
            kind="departure"
            date={booking.date}
            time={booking.time}
            onDateChange={(value) => change("date", value)}
            onTimeChange={(value) => change("time", value)}
            min={minPickupDate}
            minTime={minPickupTime}
            onOpenChange={setDateOpen}
            onDone={() => { setDepartureSelected(true); setDateOpen(false); }}
          />
          {/* Return picker for the Edit sheet's "Add return". */}
          <DateTimePicker
            open={returnDateOpen}
            kind="return"
            date={returnDate}
            time={returnTime}
            onDateChange={(value) => { setReturnDate(value); setReturnFareQuote(null); setQuoteSummary(null); }}
            onTimeChange={(value) => { setReturnTime(value); setReturnFareQuote(null); setQuoteSummary(null); }}
            min={booking.date}
            minTime={booking.time}
            onOpenChange={setReturnDateOpen}
            onDone={() => { setReturnTrip(true); setReturnDateOpen(false); if (!routeEditOpen) setRequoteReturn(true); }}
          />
        </>
      )}

      <Sheet open={peopleOpen} onOpenChange={setPeopleOpen}>
        <SheetContent
          id="passenger-luggage-sheet"
          side="bottom"
          showCloseButton={false}
          className="font-home max-h-[92dvh] overflow-y-auto rounded-t-[32px] border-0 bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 text-ink data-[state=open]:duration-500 motion-reduce:duration-0 sm:px-8 lg:left-1/2 lg:max-w-3xl lg:-translate-x-1/2"
        >
          <div className="mx-auto h-1.5 w-16 rounded-full bg-slate-300" aria-hidden="true" />
          <SheetHeader className="flex-row items-center justify-between px-0 pb-2 pt-5 text-left">
            <SheetTitle className="text-[28px] font-semibold tracking-[-.03em] sm:text-[34px]">
              {t("pax.title")}
            </SheetTitle>
            <button
              type="button"
              onClick={() => setPeopleOpen(false)}
              className="grid size-12 place-items-center rounded-full bg-slate-100 text-brand-deep transition hover:bg-orange-50"
              aria-label={t("pax.close")}
            >
              <X size={25} />
            </button>
          </SheetHeader>

          <div className="grid gap-6 py-4">
            <SheetCounter
              label={t("pax.adults")}
              description={t("pax.adultsHint")}
              value={adultPassengers}
              min={1}
              max={Math.min(MAX_GROUP_PASSENGERS - childPassengers, MAX_GROUP_BAGS - childPassengers - extraBagSets)}
              onChange={changeAdults}
            />
            <SheetCounter
              label={t("pax.children")}
              description={t("pax.childrenHint")}
              value={childPassengers}
              min={0}
              max={Math.min(MAX_GROUP_PASSENGERS - adultPassengers, MAX_GROUP_BAGS - adultPassengers - extraBagSets)}
              onChange={changeChildren}
            />
          </div>

          <div className="mt-5 rounded-[24px] bg-slate-100 p-5 text-slate-600">
            <p className="mb-4 font-semibold">{t("pax.groupCanBring")}</p>
            <div className="grid gap-4 text-base sm:grid-cols-2">
              <span className="flex items-center gap-3">
                <Luggage size={24} aria-hidden="true" />
                <strong>{t("pax.checkedBags", { count: booking.luggage })}</strong>
              </span>
              <span className="flex items-center gap-3">
                <Luggage size={21} aria-hidden="true" />
                <strong>{t("pax.carryOn", { count: booking.luggage })}</strong>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPeopleOpen(false)}
            className="mt-5 min-h-14 w-full rounded-full bg-brand px-6 text-lg font-bold text-white transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {t("common.done")}
          </button>
        </SheetContent>
      </Sheet>

      {/* Keyed by stage so each step fades in rather than swapping abruptly. */}
      <div key={stage} className="animate-in fade-in slide-in-from-bottom-2 duration-300 motion-reduce:animate-none">
      {stage === "vehicle" && (
        serviceType === "transfer" && (!quoteRequest || demoRoute) ? <BookingResultsMap
          pickup={booking.pickup}
          dropoff={booking.dropoff}
          date={booking.date}
          time={booking.time}
          vehicles={pricedVehicles}
          selectedVehicle={vehicle}
          quote={fareQuote}
          returnQuote={returnFareQuote}
          returnDate={returnDate}
          returnTime={returnTime}
          returnTrip={returnTrip}
          priceBreakdown={quoteSummary?.prices}
          checkoutReady={!returnTrip || Boolean(returnFareQuote && quoteSummary)}
          loading={routeLoading}
          error={pricingMessage}
          onSelectVehicle={setVehicle}
          onEdit={() => goToStage("search")}
          onEditRoute={() => setRouteEditOpen(true)}
          onAddReturn={() => {
            if (!returnTrip) { setReturnDate(booking.date); setReturnTime(booking.time); }
            setReturnDateOpen(true);
          }}
          onRetry={retryRoute}
          passengers={booking.passengers}
          onEditTrip={() => setTripEditOpen(true)}
          childSeats={booking.childSeats}
          exchangeStop={exchangeStop}
          memberTier={memberTier}
          giftVouchers={vouchers}
          onExtrasChange={(extras) => { setExchangeStop(extras.exchangeStop); setBooking((current) => ({ ...current, childSeats: extras.childSeats })); }}
          onContinue={() => goToStage("details")}
        /> : <section className="bg-white">
          <div className="mx-auto max-w-[760px] px-5 py-8 lg:py-12">
            <button
              type="button"
              onClick={() => goToStage("search")}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-100 px-4 text-sm font-bold text-ink transition hover:bg-slate-200"
            >
              <ArrowLeft size={16} aria-hidden="true" /> Edit search
            </button>
            <h1 className="mt-5 text-3xl font-black tracking-[-.03em] text-ink sm:text-4xl">
              {serviceType === "hourly" ? `Select your ${booking.bookedHours}-hour ride` : "Select your ride"}
            </h1>
            {quoteRequest && (
              <div className="mt-5 rounded-2xl border border-orange-200 bg-cream p-4 text-sm leading-6 text-ink">
                <p className="font-bold">Live pricing isn&apos;t connected yet.</p>
                <p className="mt-1 text-ink/80">
                  Choose your vehicle and add your details. We&apos;ll confirm the exact price with you before anything is charged.
                </p>
                <p className="mt-2 truncate text-ink/70">
                  {booking.pickup}
                  {serviceType === "transfer" && ` → ${booking.dropoff}`}
                </p>
              </div>
            )}
            {hourlyQuote && (
              <dl className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
                <div className="min-w-0 rounded-2xl bg-brand-soft p-3 sm:p-4">
                  <dt className="text-[11px] font-bold uppercase tracking-[.08em] text-slate-500 sm:text-xs">Duration</dt>
                  <dd className="mt-1 truncate text-base font-black text-ink sm:text-lg">{hourlyQuote.bookedHours} hours</dd>
                </div>
                <div className="min-w-0 rounded-2xl bg-brand-soft p-3 sm:p-4">
                  <dt className="text-[11px] font-bold uppercase tracking-[.08em] text-slate-500 sm:text-xs">Area</dt>
                  <dd className="mt-1 truncate text-base font-black text-ink sm:text-lg">{hourlyQuote.area.name}</dd>
                </div>
                <div className="min-w-0 rounded-2xl bg-brand-soft p-3 sm:p-4">
                  <dt className="text-[11px] font-bold uppercase tracking-[.08em] text-slate-500 sm:text-xs">Included</dt>
                  <dd className="mt-1 truncate text-base font-black text-ink sm:text-lg">
                    {Math.round((hourlyQuote.prices.economy_sedan?.includedDistanceMeters ?? 0) / 1000)} km
                  </dd>
                </div>
              </dl>
            )}
            <h2 className="mt-8 text-sm font-black uppercase tracking-[.12em] text-ink">Choose your ride</h2>
            <div className="mt-3 space-y-3">
              {pricedVehicles.map((item) => (
                <VehicleOption
                  key={item.id}
                  item={item}
                  active={vehicle === item.id}
                  disabled={!hourlyQuote && !quoteRequest}
                  note={serviceType === "hourly" ? `${booking.bookedHours} hours` : undefined}
                  priceText={quoteRequest ? "On request" : undefined}
                  onSelect={() => setVehicle(item.id)}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => goToStage("payment")}
              disabled={!hourlyQuote && !quoteRequest}
              className="mt-6 hidden min-h-14 w-full items-center justify-center gap-2 rounded-full bg-brand text-base font-black text-ink shadow-lg shadow-orange-900/15 transition hover:bg-brand-hover disabled:opacity-50 lg:flex"
            >
              Continue with {chosenVehicle.name} <ArrowRight size={18} aria-hidden="true" />
            </button>
            <p className="mt-3 text-center text-xs text-slate-500">
              {quoteRequest ? "Private driver · price confirmed before payment" : "Private driver · price locked for 20 minutes"}
            </p>
          </div>
        </section>
      )}

      {stage === "details" && (
        <BookingDetailsStep
          booking={booking}
          change={change}
          fieldErrors={fieldErrors}
          savedTravellers={savedTravellers}
          signedIn={signedIn}
          savedBilling={savedBilling}
          saveBilling={saveBilling}
          onSaveBillingChange={setSaveBilling}
          applyTraveller={(traveller) => setBooking((current) => ({
            ...current,
            name: traveller.name,
            surname: traveller.surname,
            email: traveller.email || current.email,
            phone: traveller.phone || current.phone,
            specialRequests: traveller.notes && !current.specialRequests ? traveller.notes : current.specialRequests,
          }))}
          total={quoteRequest && !demoRoute ? "Quote on request" : money(payable)}
          onBack={() => goToStage("vehicle")}
          onContinue={continueToPayment}
        />
      )}
      {stage === "payment" && (
        <section className="bg-[#F4F5F7] px-4 py-8 sm:px-6 lg:py-12">
          <div className="mx-auto grid max-w-[1120px] items-start gap-6 lg:grid-cols-[1fr_440px]">
            {/* Payment option */}
            <div className="rounded-2xl bg-white p-5 sm:p-6">
              <h2 className="flex items-center gap-3 text-[20px] font-semibold text-ink"><Wallet size={22} className="text-slate-600" aria-hidden="true" />Select payment option</h2>
              <div role="radiogroup" aria-label="Payment method" className="mt-5 grid gap-4">
                {([
                  ["card", "Card or online payment", "You’ll continue to Stripe’s secure page to pay. Waydidi never receives or stores your card details."],
                  ["cash", "Cash to driver", "Your booking is confirmed now. Pay the driver in Thai baht at pickup."],
                ] as const).map(([id, label, note]) => {
                  const on = payment === id;
                  return <div key={id} className={`rounded-2xl border transition-colors ${on ? "border-slate-200 bg-slate-50/70" : "border-slate-200 bg-white"}`}>
                    <button type="button" role="radio" aria-checked={on} onClick={() => setPayment(id)} className="flex min-h-[72px] w-full items-center gap-3 px-4 text-left sm:px-5">
                      <span className={`grid size-5 shrink-0 place-items-center rounded-full border-2 ${on ? "border-brand" : "border-slate-300"}`}>{on && <span className="size-2.5 rounded-full bg-brand" />}</span>
                      <span className="flex-1 text-[17px] text-ink">{label}</span>
                      {id === "card"
                        ? <span className="flex items-center gap-1.5" aria-hidden="true">
                            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] font-black italic tracking-tight text-[#1A1F71]">VISA</span>
                            <span className="flex rounded-md border border-slate-200 bg-white px-2 py-1.5"><span className="size-3.5 rounded-full bg-[#EB001B]" /><span className="-ml-1.5 size-3.5 rounded-full bg-[#F79E1B]/90" /></span>
                            <span className="hidden rounded-md bg-[#2E77BC] px-2 py-1 text-[11px] font-black text-white sm:inline">AMEX</span>
                            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] font-bold text-brand-deep">+ more</span>
                          </span>
                        : <span className="grid size-9 place-items-center rounded-lg border border-slate-200 bg-white" aria-hidden="true"><span className="grid size-6 place-items-center rounded-full bg-emerald-500 text-[13px] font-black text-white">฿</span></span>}
                    </button>
                    {on && <p className="flex items-start gap-2 px-4 pb-4 text-[14px] leading-6 text-slate-600 sm:px-5"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand-deep" aria-hidden="true" />{note}</p>}
                  </div>;
                })}
              </div>
              <label className="mt-6 flex cursor-pointer items-start gap-3 text-[14px] leading-6 text-slate-700">
                <input
                  data-booking-field="termsAccepted"
                  aria-invalid={Boolean(fieldErrors.termsAccepted)}
                  aria-describedby={fieldErrors.termsAccepted ? "terms-error" : undefined}
                  type="checkbox"
                  required
                  checked={booking.termsAccepted}
                  onChange={(event) => change("termsAccepted", event.target.checked)}
                  className="mt-1 size-4 shrink-0 accent-brand"
                />
                <span>
                  I agree to the <a href="/terms" target="_blank" className="font-semibold text-brand-deep underline underline-offset-2">booking terms and 24-hour cancellation policy</a>, and acknowledge the <a href="/privacy" target="_blank" className="font-semibold text-brand-deep underline underline-offset-2">privacy notice</a>.
                </span>
              </label>
              {fieldErrors.termsAccepted && <p id="terms-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{fieldErrors.termsAccepted}</p>}
              {error && (
                <div role="alert" className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800">
                  <p>{error}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={continueToReview} disabled={!isOnline} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-white disabled:opacity-50"><RefreshCw size={16} /> Review again</button>
                    <button type="button" onClick={() => { setError(""); goToStage("vehicle"); }} className="min-h-11 rounded-full border border-red-200 bg-white px-4 text-red-800">Review trip</button>
                  </div>
                </div>
              )}
              <button onClick={continueToReview} disabled={!isOnline} className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-brand text-[16px] font-bold text-white hover:bg-brand-deep disabled:opacity-60">
                {quoteRequest ? "Review booking" : `Review booking | ${money(payable)}`}
              </button>
              <button onClick={() => goToStage("details")} className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft size={17} /> Back to details</button>
            </div>

            <div className="grid gap-6 lg:sticky lg:top-6">
              {/* Promo */}
              {!quoteRequest && (
                <div className="rounded-2xl bg-white p-5 sm:p-6">
                  <h3 className="flex items-center gap-3 text-[20px] font-semibold text-ink"><Gift size={22} className="text-slate-600" aria-hidden="true" />Promo code or gift card</h3>
                  {promo ? (
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5">
                      <span className="min-w-0">
                        <strong className="block tracking-wide text-emerald-900">{promo.code}</strong>
                        <span className="block truncate text-sm text-emerald-800">{promo.title} · −{money(promo.discount)}</span>
                        {autoApplied && <span className="block text-xs text-emerald-700">Best coupon from your account, applied automatically</span>}
                      </span>
                      <button type="button" onClick={() => { setPromo(null); setAutoApplied(false); setPromoError(""); }} className="shrink-0 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-emerald-900">Remove</button>
                    </div>
                  ) : (
                    <>
                      <div className={`mt-4 flex items-center rounded-xl border bg-white p-1 pl-4 focus-within:border-brand ${promoError ? "border-red-400" : "border-slate-200"}`}>
                        <label className="sr-only" htmlFor="promo-code">Promo code</label>
                        <input
                          id="promo-code"
                          value={promoInput}
                          onChange={(e) => { setPromoInput(e.target.value.toUpperCase()); setPromoError(""); }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void applyPromo(); } }}
                          maxLength={32}
                          autoCapitalize="characters"
                          placeholder="Enter code"
                          aria-invalid={Boolean(promoError)}
                          className="h-10 min-w-0 flex-1 bg-transparent text-base uppercase tracking-wide outline-none placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400"
                        />
                        <button type="button" onClick={() => void applyPromo()} disabled={promoChecking} className="h-10 shrink-0 rounded-lg bg-brand px-5 font-semibold text-white disabled:opacity-60">{promoChecking ? "Checking…" : "Apply"}</button>
                      </div>
                      {promoError && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{promoError}</p>}
                    </>
                  )}
                </div>
              )}

              {/* Summary */}
              <div className="rounded-2xl bg-white p-5 sm:p-6">
                <h3 className="border-b border-slate-200 pb-4 text-[20px] font-semibold text-ink">Summary</h3>
                <div className="mt-4 grid gap-3 text-[15px] text-slate-600">
                  {returnTrip && quoteSummary?.prices[vehicle] ? <>
                    <div className="flex justify-between"><span>Outbound fare</span><span className="tabular-nums text-ink">{money(quoteSummary.prices[vehicle].outbound)}</span></div>
                    <div className="flex justify-between"><span>Return fare</span><span className="tabular-nums text-ink">{money(quoteSummary.prices[vehicle].return)}</span></div>
                  </> : !quoteRequest && <div className="flex justify-between"><span>Fare</span><span className="tabular-nums text-ink">{money(chosenVehicle.price)}</span></div>}
                  {promo && !quoteRequest && <div className="flex justify-between"><span>Discount ({promo.code})</span><span className="tabular-nums text-emerald-700">−{money(promo.discount)}</span></div>}
                  {memberDiscount > 0 && memberTier && <div className="flex justify-between"><span>{memberTier.name} member ({memberTier.percent}%)</span><span className="tabular-nums text-emerald-700">−{money(memberDiscount)}</span></div>}
                  {booking.childSeats > 0 && !quoteRequest && <div className="flex justify-between"><span>Child seat × {booking.childSeats}</span><span className="tabular-nums text-ink">{freeLabel((booking.childSeats - freeAddons.childSeats) * CHILD_SEAT_THB, tierFree.childSeats >= booking.childSeats)}</span></div>}
                  {exchangeStop && !quoteRequest && <div className="flex justify-between"><span>Currency exchange stop</span><span className="tabular-nums text-ink">{freeLabel(freeAddons.exchangeStop ? 0 : EXCHANGE_STOP_THB, tierFree.exchangeStop)}</span></div>}
                  <div className="flex justify-between"><span>Payment</span><span className="text-ink">{payment === "card" ? "Online" : "Cash to driver"}</span></div>
                </div>
                <div className="mt-4 flex items-end justify-between border-t border-slate-200 pt-4">
                  <span className="text-[17px] font-semibold text-ink">Total</span>
                  <span className="text-right text-[20px] font-semibold tabular-nums text-ink">{quoteRequest ? "Quote on request" : money(payable)}{!quoteRequest && currency !== "THB" && <span className="block text-xs font-medium text-slate-500">Charged in THB: {thb(payable)}</span>}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {stage === "review" && (
        <section className="mx-auto grid max-w-[1100px] gap-6 px-5 py-10 pb-28 lg:grid-cols-[1fr_360px] lg:px-10 lg:py-16">
          <div>
            <p className="text-sm font-black uppercase tracking-[.16em] text-brand-deep">Final check</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-4xl">Review your booking</h2>
            <p className="mt-3 text-slate-600">Check the journey and passenger details before confirming. Times are shown in Thailand time.</p>

            <div className="mt-8 space-y-4">
              <ReviewSection title="Journey" onEdit={() => goToStage("search")} editLabel="Edit journey">
                <ReviewDetail label="Pickup" value={booking.pickup} />
                <ReviewDetail label="Destination" value={serviceType === "hourly" ? "Flexible hourly itinerary" : booking.dropoff} />
                <ReviewDetail label="Departure" value={`${formatDate(booking.date)} · ${formatTimeLabel(booking.time)} · Thailand time`} />
                {returnTrip && <ReviewDetail label="Return" value={`${formatDate(returnDate)} · ${formatTimeLabel(returnTime)} · Thailand time`} />}
                <ReviewDetail label="Travelers" value={`${booking.passengers} passengers · ${booking.luggage} luggage`} />
              </ReviewSection>

              <ReviewSection title="Ride" onEdit={() => goToStage("vehicle")} editLabel="Edit vehicle">
                <ReviewDetail label="Vehicle" value={chosenVehicle.name} />
                <ReviewDetail label="Service" value={serviceType === "hourly" ? `${booking.bookedHours}-hour private driver` : returnTrip ? "Round trip private transfer" : "One-way private transfer"} />
                {serviceType === "transfer" && fareQuote?.inclusions && (() => {
                  const lines = inclusionLines(fareQuote.inclusions, locale);
                  return <ReviewDetail label="Tolls" value={lines.included.length ? lines.included.join(" · ") : `Not included: ${lines.excluded.join(", ")}`} />;
                })()}
              </ReviewSection>

              <ReviewSection title="Passenger" onEdit={() => goToStage("details")} editLabel="Edit passenger details">
                <ReviewDetail label="Lead passenger" value={booking.name} />
                <ReviewDetail label="Surname" value={booking.surname} />
                <ReviewDetail label="Email" value={booking.email} />
                <ReviewDetail label="Phone / WhatsApp" value={booking.phone} />
                {booking.flightNumber && <ReviewDetail label="Flight" value={booking.flightNumber.toUpperCase()} />}
                {booking.pickupSign && <ReviewDetail label="Pickup sign" value={booking.pickupSign} />}
                {booking.oversizedLuggage && <ReviewDetail label="Oversized luggage" value="Declared" />}
                {exchangeStop && <ReviewDetail label="Currency exchange stop" value="Requested" />}
                {booking.specialRequests && <ReviewDetail label="Special requests" value={booking.specialRequests} />}
              </ReviewSection>

              <ReviewSection title="Payment" onEdit={() => goToStage("payment")} editLabel="Edit payment method">
                <ReviewDetail label="Method" value={payment === "card" ? "Secure online payment with Stripe" : "Cash to the driver at pickup"} />
                <ReviewDetail label="Terms" value="Accepted" />
              </ReviewSection>
            </div>
            <button onClick={() => goToStage("payment")} className="mt-5 inline-flex min-h-11 items-center gap-2 font-bold text-slate-600">
              <ArrowLeft size={18} /> Back to passenger details
            </button>
          </div>

          <aside className="h-fit rounded-3xl bg-[#071c61] p-6 text-white lg:sticky lg:top-6">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-white/10"><CheckCircle2 size={22} className="text-[#FFB45E]" /></span>
              <div><p className="text-xs font-bold uppercase tracking-[.14em] text-white/60">Ready to book</p><h3 className="font-black">{chosenVehicle.name}</h3></div>
            </div>
            <div className="my-6 border-t border-white/15" />
            {returnTrip && quoteSummary?.prices[vehicle] && (
              <div className="mb-5 space-y-3 text-sm">
                <SummaryLine label="Outbound" value={money(quoteSummary.prices[vehicle].outbound)} />
                <SummaryLine label="Return" value={money(quoteSummary.prices[vehicle].return)} />
              </div>
            )}
            {promo && !quoteRequest && (
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-white/65">Discount ({promo.code})</span>
                <span className="font-semibold text-emerald-300">−{money(promo.discount)}</span>
              </div>
            )}
            {memberDiscount > 0 && memberTier && (
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-white/65">{memberTier.name} member ({memberTier.percent}%)</span>
                <span className="font-semibold text-emerald-300">−{money(memberDiscount)}</span>
              </div>
            )}
            {(booking.childSeats > 0 || exchangeStop) && !quoteRequest && (
              <div className="mb-3 space-y-1 text-sm">
                {booking.childSeats > 0 && <div className="flex items-center justify-between"><span className="text-white/65">Child seat × {booking.childSeats}</span><span className="font-semibold">{freeLabel((booking.childSeats - freeAddons.childSeats) * CHILD_SEAT_THB, tierFree.childSeats >= booking.childSeats)}</span></div>}
                {exchangeStop && <div className="flex items-center justify-between"><span className="text-white/65">Currency exchange stop</span><span className="font-semibold">{freeLabel(freeAddons.exchangeStop ? 0 : EXCHANGE_STOP_THB, tierFree.exchangeStop)}</span></div>}
              </div>
            )}
            <div className="flex items-end justify-between">
              <span className="text-sm text-white/65">Total</span>
              <strong className={quoteRequest ? "text-xl" : "text-3xl"}>
                {quoteRequest ? "Quote on request" : money(payable)}{!quoteRequest && currency !== "THB" && <span className="mt-1 block text-xs font-medium text-slate-500">Charged in THB: {thb(payable)}</span>}
              </strong>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/65">
              {quoteRequest
                ? "Online booking needs live route pricing, which isn't connected yet. Contact us with these details and we'll confirm your ride and price."
                : "The server verifies the current journey and price again before confirmation."}
            </p>
            {error && <p role="alert" className="mt-4 rounded-xl bg-red-950/40 p-4 text-sm font-semibold text-red-100">{error}</p>}
            {/* The server only accepts bookings backed by a live quote, so a
                quote request ends in contact instead of a payment that would fail. */}
            {quoteRequest ? (
              <Link
                href="/contact"
                className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-brand font-bold text-ink"
              >
                Contact us to confirm <ArrowRight size={19} />
              </Link>
            ) : (
              <button
                onClick={confirmBooking}
                disabled={loading || !isOnline}
                className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-brand font-bold text-ink disabled:opacity-60"
              >
                {loading ? "Verifying booking…" : payment === "cash" ? "Confirm cash booking" : "Confirm and pay"}
                {!loading && <ArrowRight size={19} />}
              </button>
            )}
          </aside>
        </section>
      )}

      {stage === "confirmation" && (
        <section className="mx-auto max-w-[900px] px-5 py-12 lg:px-10 lg:py-16">
          <div className="booking-confirmation overflow-hidden rounded-[32px] bg-white shadow-xl shadow-orange-950/10">
            <div className="bg-brand p-7 text-white sm:p-10">
              <Link href="/" className="mb-8 inline-flex text-white" aria-label="Waydidi home"><WaydidiLogo className="h-[88px] w-auto" /></Link>
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
                {promo && <Detail label={`Discount (${promo.code})`} value={`−${thb(promo.discount)}`} />}
                {memberDiscount > 0 && memberTier && <Detail label={`${memberTier.name} member (${memberTier.percent}%)`} value={`−${thb(memberDiscount)}`} />}
                {addons > 0 && <Detail label="Add-ons" value={`+${thb(addons)}`} />}
                <Detail
                  label="Total"
                  value={thb(payable)}
                />
              </div>
              <div className="no-print mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  onClick={() => window.print()}
                  className="flex h-13 items-center justify-center gap-2 rounded-full bg-brand px-7 font-bold text-ink"
                >
                  <Printer size={19} /> Save confirmation as PDF
                </button>
                <button
                  onClick={() => {
                    goToStage("search", { replace: true });
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

      </div>

      {stage === "search" && (
        <>
          {children}
        </>
      )}
      {priceBar && (
        <>
          <div aria-hidden="true" className="h-24 lg:hidden" />
          <div className="no-print fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgb(33_20_10/0.08)] lg:hidden">
            <div className="mx-auto flex max-w-xl items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-500">{priceBar.label}</p>
                <p className="text-xl font-black tracking-[-.02em] text-ink" aria-live="polite">
                  {priceText}
                </p>
              </div>
              <button
                type="button"
                onClick={priceBar.onClick}
                disabled={priceBar.disabled}
                className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-brand px-5 font-black text-ink shadow-md shadow-orange-900/15 transition hover:bg-brand-hover disabled:opacity-50"
              >
                {priceBar.action} <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
          </div>
        </>
      )}
    </main>
    </I18nProvider>
  );
}

// "Thu, Sep 24" style date in the visitor's language.
function shortDate(value: string, locale: Locale) {
  const date = new Date(`${value}T12:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale === "th" ? "th-TH" : locale === "zh" ? "zh-CN" : "en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Bangkok" });
}

// Calendar with a departing arrow, shown once a departure is chosen.
function DepartureIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1C1C1C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 max-[359px]:hidden">
    <path d="M8 2v4M16 2v4M3 10h18" />
    <path d="M12 21H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7" />
    <path d="M15 18h7m-3-3 3 3-3 3" />
  </svg>;
}

function SheetCounter({
  label,
  description,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-5">
      <span className="min-w-0">
        <strong className="block text-lg font-semibold text-slate-950">{label}</strong>
        <span className="mt-0.5 block text-base text-slate-500">{description}</span>
      </span>
      <span className="flex min-h-14 shrink-0 items-center rounded-full border border-slate-300 px-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="grid size-11 place-items-center rounded-full text-slate-700 transition hover:bg-orange-50 hover:text-brand-deep disabled:cursor-not-allowed disabled:text-slate-300"
          aria-label={t("pax.decrease", { label })}
        >
          <Minus size={19} />
        </button>
        <strong className="w-10 text-center text-xl">{value}</strong>
        <button
          type="button"
          onClick={() => onChange(max === undefined ? value + 1 : Math.min(max, value + 1))}
          disabled={max !== undefined && value >= max}
          className="grid size-11 place-items-center rounded-full text-slate-700 transition hover:bg-orange-50 hover:text-brand-deep disabled:cursor-not-allowed disabled:text-slate-300"
          aria-label={t("pax.increase", { label })}
        >
          <Plus size={19} />
        </button>
      </span>
    </div>
  );
}
function ReviewSection({
  title,
  editLabel,
  onEdit,
  children,
}: {
  title: string;
  editLabel: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-black">{title}</h3>
        <button type="button" onClick={onEdit} aria-label={editLabel} className="min-h-11 rounded-full bg-orange-50 px-4 text-sm font-bold text-brand-deep">
          Edit
        </button>
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}
function ReviewDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-bold uppercase tracking-[.12em] text-slate-400">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-slate-800">{value}</dd>
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
