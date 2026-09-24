"use client";

import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CarFront,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Luggage,
  Minus,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import Link from "next/link";
import { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { BookingResultsMap } from "@/components/booking-results-map";
import { FlightLookup } from "@/components/flight-lookup";
import {
  GoogleRoutePicker,
  type RouteInfo,
} from "@/components/google-route-picker";
import { validateBookingReview, type ReviewFieldErrors } from "@/lib/booking-review";
import { destinations } from "@/lib/public-content";
import { SiteHeader } from "@/components/site-header";

type Stage = "search" | "vehicle" | "payment" | "review" | "confirmation";
type ServiceType = "transfer" | "hourly";
type Booking = {
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
};

const RECOVERY_DRAFT_KEY = "waydidi-booking-recovery-v1";
const RECOVERY_DRAFT_TTL = 2 * 60 * 60 * 1000;

const defaultPickupDate = new Date(Date.now() + 86_400_000).toLocaleDateString(
  "en-CA",
  { timeZone: "Asia/Bangkok" },
);

// Today in the operating timezone, not the visitor's. A traveler browsing from
// Europe must not be offered a pickup slot Bangkok has already driven past.
function bangkokToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

function bangkokNowTime() {
  return new Date().toLocaleTimeString("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

const destinationsHref = "/destinations";

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
    popular: true,
  },
  {
    id: "comfort_suv",
    name: "Comfort SUV",
    tagline: "More room for every journey",
    price: 2200,
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

export default function Home() {
  const [stage, setStage] = useState<Stage>("search");
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
  const [payment, setPayment] = useState<"card" | "cash">("card");
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [fareQuote, setFareQuote] = useState<FareQuote | null>(null);
  const [returnFareQuote, setReturnFareQuote] = useState<FareQuote | null>(null);
  const [quoteSummary, setQuoteSummary] = useState<QuoteSummary | null>(null);
  const [hourlyQuote, setHourlyQuote] = useState<HourlyQuote | null>(null);
  const [pickupPlaceId, setPickupPlaceId] = useState("");
  const [pricingMessage, setPricingMessage] = useState("");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(false);
  const [routeLoading, setRouteLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<ReviewFieldErrors>({});
  const [recoveryNotice, setRecoveryNotice] = useState("");
  const [isOnline, setIsOnline] = useState(true);
  const [draftReady, setDraftReady] = useState(false);
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
  }, [booking, vehicle, payment, serviceType, fareQuote?.quoteId, returnFareQuote?.quoteId, hourlyQuote?.quoteId]);

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
      .then((account: { signedIn?: boolean; name?: string | null; surname?: string | null; email?: string; phone?: string | null } | null) => {
        if (!active || !account?.signedIn) return;
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
        checkoutAttemptRef.current = draft.checkoutAttemptId;
      } else if (raw) {
        sessionStorage.removeItem(RECOVERY_DRAFT_KEY);
      }

      const params = new URLSearchParams(window.location.search);
      if (params.get("payment") === "cancelled") {
        setRecoveryNotice(
          valid
            ? "Payment was cancelled. Your trip details were restored, and you can continue when ready."
            : "Payment was cancelled. No booking was charged; review your trip and try again when ready.",
        );
        window.history.replaceState(
          { waydidiStage: valid && draft ? draft.stage : "search" },
          "",
          window.location.pathname + window.location.hash,
        );
      } else if (valid && draft && draft.stage !== "search") {
        setRecoveryNotice("Your unfinished booking was restored in this tab.");
      }
    } catch {
      sessionStorage.removeItem(RECOVERY_DRAFT_KEY);
    } finally {
      setDraftReady(true);
    }
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMinPickupDate(bangkokToday());
    setMinPickupTime(bangkokNowTime());
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
        price: hourlyQuote?.prices[item.id]?.total ?? quoteSummary?.prices[item.id]?.total ?? fareQuote?.prices[item.id]?.total ?? item.price,
      })),
    [fareQuote, hourlyQuote, quoteSummary],
  );
  const chosenVehicle = useMemo(
    () =>
      pricedVehicles.find((item) => item.id === vehicle) ?? pricedVehicles[0],
    [vehicle, pricedVehicles],
  );
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

  function continueToReview() {
    const errors = validateBookingReview(booking);
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
  const changeAdults = (value: number) => {
    const adults = Math.max(1, value);
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
    setBooking((current) => ({
      ...current,
      passengers: adultPassengers + children,
      luggage: adultPassengers + children + extraBagSets,
    }));
  };
  const changeExtraBagSets = (value: number) => {
    const extraSets = Math.max(0, value);
    setExtraBagSets(extraSets);
    setBooking((current) => ({
      ...current,
      luggage: adultPassengers + childPassengers + extraSets,
    }));
  };

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!navigator.onLine) {
      setPricingMessage("You are offline. Reconnect to calculate your route and prices.");
      return;
    }
    if (!departureSelected) {
      setPricingMessage("Choose your departure date and time first.");
      setDateOpen(true);
      return;
    }
    if (serviceType === "transfer" && (!routeInfo?.pickupPlaceId || !routeInfo.dropoffPlaceId)) {
      setPricingMessage("Select both locations from the Google suggestions to calculate your route.");
      return;
    }
    if (serviceType === "hourly" && !hourlyQuote) {
      if (!pickupPlaceId) { setPricingMessage("Select a pickup location from Google Maps."); return; }
      try {
        setLoading(true); setPricingMessage("");
        const response = await fetch("/api/hourly-quote",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({pickupPlaceId,bookedHours:booking.bookedHours,pickupDate:booking.date,pickupTime:booking.time,timezone:"Asia/Bangkok"})});
        const result = await response.json() as HourlyQuote & {error?:string};
        if (!response.ok) { setPricingMessage(result.error??"Hourly pricing is unavailable."); return; }
        setHourlyQuote(result);
      } catch { setPricingMessage("Hourly pricing is temporarily unavailable."); return; }
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
        setPricingMessage(result.error ?? "This route needs a custom quote.");
        return;
      }
      setFareQuote(result);
    } catch {
      setPricingMessage("Route pricing is temporarily unavailable.");
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
          oversizedLuggage: booking.oversizedLuggage,
          specialRequests: booking.specialRequests,
          termsAccepted: booking.termsAccepted,
          pickup: booking.pickup,
          dropoff: booking.dropoff,
          pickupDate: booking.date,
          pickupTime: booking.time,
          timezone: "Asia/Bangkok",
          passengers: booking.passengers,
          luggage: booking.luggage,
          vehicle,
          paymentMethod: payment,
          fareQuoteId: fareQuote?.quoteId,
          returnFareQuoteId: returnTrip ? returnFareQuote?.quoteId : undefined,
          returnDate: returnTrip ? returnDate : undefined,
          returnTime: returnTrip ? returnTime : undefined,
          serviceType,
          bookedHours: serviceType === "hourly" ? booking.bookedHours : undefined,
          hourlyQuoteId: hourlyQuote?.quoteId,
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

  return (
    <main className="min-h-screen bg-white text-[#1f1726]">
      {!isOnline && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-4 z-[70] mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-[#21140A] px-5 py-4 text-sm font-semibold text-white shadow-2xl"
        >
          <WifiOff className="shrink-0 text-[#FFB45E]" size={20} />
          <span>You’re offline. Your booking details stay saved in this tab.</span>
        </div>
      )}
      {isOnline && recoveryNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-4 bottom-4 z-[70] mx-auto flex max-w-xl items-center gap-3 rounded-2xl border border-orange-200 bg-white px-5 py-4 text-sm font-semibold text-[#21140A] shadow-2xl"
        >
          <RefreshCw className="shrink-0 text-[#D96F00]" size={20} />
          <span className="flex-1">{recoveryNotice}</span>
          <button
            type="button"
            onClick={() => setRecoveryNotice("")}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-orange-50 text-[#B85E00]"
            aria-label="Dismiss recovery message"
          >
            <X size={18} />
          </button>
        </div>
      )}
      <section
        className={`relative ${stage === "search" ? "bg-[#FF8A05] text-white" : "bg-white text-[#17171a]"}`}
      >
        {stage === "search" ? (
          <SiteHeader overlay />
        ) : (
          <header className="relative z-40 flex h-[72px] w-full items-center justify-between bg-[#FF8A05] px-5 text-white lg:px-8">
            <Link href="/" className="inline-flex text-white" aria-label="Waydidi home">
              <WaydidiLogo className="h-[43px] w-auto sm:h-[53px]" />
            </Link>
            <Progress stage={stage} inHeader />
          </header>
        )}

        {stage === "search" && (
          <div className="relative z-10 w-full px-5 pb-12 pt-[98px] lg:px-6 lg:pb-18 lg:pt-[160px]">
            <div className="mb-6 max-w-2xl">
              <h1 className="text-[33.5px] font-medium leading-[1.08] tracking-[-.045em] sm:text-[46.3px] lg:text-[52.7px]">
                A private ride that moves at your pace.
              </h1>
              <p className="mt-3 text-lg font-medium text-[#E6DED5] sm:text-xl lg:text-2xl">
                Book Your Ride Anywhere in Thailand
              </p>
            </div>
            <form id="booking-search" onSubmit={search} className="w-full scroll-mt-28">
              <div className="inline-grid h-[46px] w-[min(270px,100%)] grid-cols-2 gap-1 rounded-[15px] bg-white p-1 text-sm font-bold text-slate-500 shadow-md shadow-orange-950/10 lg:inline-flex lg:h-auto lg:w-auto lg:rounded-b-none lg:rounded-t-[26px] lg:p-1.5 lg:pb-0 lg:text-base lg:shadow-none">
                <button onClick={()=>{setServiceType("transfer");setHourlyQuote(null);}} type="button" className={`flex min-w-0 items-center justify-center gap-1.5 rounded-[12px] px-2.5 transition lg:min-h-12 lg:gap-2 lg:rounded-full lg:px-6 lg:py-3 ${serviceType === "transfer" ? "bg-[#FF8A05] text-white" : "hover:bg-orange-50 hover:text-slate-900"}`}>
                  <CarFront className="size-[17px] lg:size-[19px]" aria-hidden="true" /> Transfer
                </button>
                <button onClick={()=>{setServiceType("hourly");setFareQuote(null);setPricingMessage("");}} className={`flex min-w-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] px-2.5 transition lg:min-h-12 lg:gap-2 lg:rounded-full lg:px-6 lg:py-3 ${serviceType === "hourly" ? "bg-[#FF8A05] text-white" : "hover:bg-orange-50 hover:text-slate-900"}`} type="button">
                  <Clock3 className="size-[17px] lg:size-[19px]" aria-hidden="true" /> By the hour
                </button>
              </div>
              <div className={`mt-2.5 overflow-visible rounded-[22px] bg-white p-2.5 text-slate-950 shadow-xl shadow-slate-900/10 lg:mt-0 lg:grid lg:items-end lg:gap-3 lg:rounded-tl-none lg:p-6 ${serviceType === "hourly" ? "lg:grid-cols-[.42fr_1.55fr_1.4fr_.58fr_auto]" : "lg:grid-cols-[.42fr_1.15fr_1.15fr_1.55fr_auto]"}`}>
                <div className="flex w-full flex-col gap-2 overflow-visible rounded-[18px] bg-white lg:contents lg:w-auto">
                <button
                  type="button"
                  onClick={() => setPeopleOpen(true)}
                  className="order-1 flex min-h-14 w-full items-center justify-between rounded-[14px] border border-slate-200 bg-white px-3.5 py-2 text-left lg:order-none lg:min-h-[88px] lg:rounded-xl lg:border-0 lg:bg-[#F4F4F4]"
                  aria-expanded={peopleOpen}
                  aria-controls="passenger-luggage-sheet"
                  aria-label={`${booking.passengers} passengers and ${booking.luggage} bags`}
                >
                  <span className="flex items-center gap-3.5 text-[15px] font-semibold text-slate-950 lg:text-base">
                    <span className="flex items-center gap-2">
                      <Users size={18} aria-hidden="true" /> {booking.passengers}
                    </span>
                    <span className="flex items-center gap-2">
                      <Luggage size={18} aria-hidden="true" /> {booking.luggage}
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
                  connectedMobile
                />
                <div className="order-4 grid min-h-14 grid-cols-2 overflow-hidden rounded-[14px] border border-slate-200 bg-white lg:order-none lg:min-h-[88px] lg:rounded-xl lg:border-0 lg:bg-[#F4F4F4]">
                  <div className="relative flex min-w-0 items-center border-r border-slate-200">
                    <button
                      type="button"
                      onClick={() => setDateOpen(true)}
                      className="flex h-full min-w-0 flex-1 items-center gap-2 px-2.5 py-2 text-left sm:px-3.5"
                      aria-expanded={dateOpen}
                    >
                      <CalendarDays className="shrink-0 text-[#FF8A05]" size={18} />
                      {departureSelected ? (
                        <span className="min-w-0 text-[15px] font-semibold leading-[18px] text-slate-950 lg:text-base lg:leading-5">
                          <span className="block truncate">{formatCompactDate(booking.date)}</span>
                          <span className="block">{formatTimeLabel(booking.time)}</span>
                        </span>
                      ) : (
                        <span className="text-[15px] font-semibold text-slate-600 lg:text-base">Departure</span>
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
                        className="mr-2 grid size-9 shrink-0 place-items-center rounded-full bg-slate-400 text-white transition hover:bg-slate-500"
                        aria-label="Remove departure date"
                      >
                        <X size={18} />
                      </button>
                    )}
                  </div>
                  {serviceType === "transfer" ? (
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
                      className="flex min-w-0 items-center gap-1.5 px-2.5 py-2 text-left text-slate-500 transition enabled:hover:bg-orange-50 disabled:cursor-not-allowed disabled:text-slate-300 sm:px-3.5"
                      aria-label={returnTrip ? "Edit return journey" : "Add return journey"}
                    >
                      {returnTrip ? (
                        <CalendarDays className="shrink-0 text-[#FF8A05]" size={20} />
                      ) : (
                        <Plus className={`shrink-0 ${departureSelected ? "text-[#FF8A05]" : ""}`} size={23} />
                      )}
                      <span className="min-w-0">
                        {returnTrip ? (
                          <>
                            <span className="block truncate text-base font-semibold leading-5 text-slate-950">{formatCompactDate(returnDate)}</span>
                            <span className="block text-base font-semibold leading-5 text-slate-950">{formatTimeLabel(returnTime)}</span>
                          </>
                        ) : (
                          <span className="text-[15px] font-semibold lg:text-base">Add return</span>
                        )}
                      </span>
                    </button>
                  ) : (
                    <span className="flex items-center px-4 text-sm text-slate-400">One-way hourly booking</span>
                  )}
                </div>
                {serviceType === "hourly" && <label className="order-5 flex min-h-14 items-center gap-2.5 rounded-[14px] border border-slate-200 bg-white px-3.5 py-2 lg:order-none lg:mt-0 lg:min-h-[88px] lg:rounded-xl lg:border-0 lg:bg-[#F4F4F4]"><Clock3 size={18}/><span className="w-full"><span className="block text-sm font-semibold text-slate-500">Duration</span><select value={booking.bookedHours} onChange={(e)=>{change("bookedHours",Number(e.target.value));setHourlyQuote(null);}} className="w-full bg-transparent text-[15px] font-semibold outline-none lg:text-base">{Array.from({length:10},(_,i)=>i+3).map(hours=><option key={hours} value={hours}>{hours} hours</option>)}</select></span></label>}
                </div>
                <div className="mt-2.5 flex items-center lg:mt-0">
                  <button
                    className="flex min-h-[52px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-[14px] bg-[#FF8A05] px-8 text-base font-black text-white shadow-lg shadow-orange-900/20 transition hover:bg-[#E97D00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A05] focus-visible:ring-offset-2 lg:min-h-[88px] lg:w-auto lg:rounded-xl lg:text-sm"
                    type="submit"
                  >
                    {loading ? "Calculating…" : "See prices"} <ArrowRight size={18} />
                  </button>
                </div>
              </div>
              <DateTimePicker
                open={dateOpen}
                title="Departure"
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
                title="Return"
                date={returnDate}
                time={returnTime}
                timeLabel="Return time"
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
                      {returnTrip && returnFareQuote && <span className="text-slate-500">Outbound and return ready</span>}
                    </>
                  ) : (
                    pricingMessage
                  )}
                </div>
              )}
              {hourlyQuote && <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-slate-800"><span className="size-3 rounded-full bg-[#FF8A05]"/><strong>{hourlyQuote.bookedHours}-hour private driver</strong><span>{hourlyQuote.area.name}</span><span className="text-slate-500">Includes {Math.round((hourlyQuote.prices.economy_sedan?.includedDistanceMeters??0)/1000)} km · price locked 20 minutes</span></div>}
            </form>
            <p className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-sm font-medium text-white/75 sm:text-base lg:mt-7 lg:text-lg">
              <span>Thailand-wide</span>
              <span aria-hidden="true">·</span>
              <span>Fixed price</span>
              <span aria-hidden="true">·</span>
              <span>Free cancellation</span>
            </p>
          </div>
        )}
      </section>

      <Sheet open={peopleOpen} onOpenChange={setPeopleOpen}>
        <SheetContent
          id="passenger-luggage-sheet"
          side="bottom"
          showCloseButton={false}
          className="max-h-[92dvh] overflow-y-auto rounded-t-[32px] border-0 bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 text-[#17171A] data-[state=open]:duration-500 motion-reduce:duration-0 sm:px-8 lg:left-1/2 lg:max-w-3xl lg:-translate-x-1/2"
        >
          <div className="mx-auto h-1.5 w-16 rounded-full bg-slate-300" aria-hidden="true" />
          <SheetHeader className="flex-row items-center justify-between px-0 pb-2 pt-5 text-left">
            <SheetTitle className="text-[28px] font-semibold tracking-[-.03em] sm:text-[34px]">
              Passengers
            </SheetTitle>
            <button
              type="button"
              onClick={() => setPeopleOpen(false)}
              className="grid size-12 place-items-center rounded-full bg-slate-100 text-[#D96F00] transition hover:bg-orange-50"
              aria-label="Close passenger and luggage selection"
            >
              <X size={25} />
            </button>
          </SheetHeader>

          <div className="grid gap-6 py-4">
            <SheetCounter
              label="Adults"
              description="Age 12 and over"
              value={adultPassengers}
              min={1}
              onChange={changeAdults}
            />
            <SheetCounter
              label="Children"
              description="Age 0–11"
              value={childPassengers}
              min={0}
              onChange={changeChildren}
            />
            <SheetCounter
              label="Extra sets of bags"
              description="1 checked bag + 1 carry-on each"
              value={extraBagSets}
              min={0}
              onChange={changeExtraBagSets}
            />
          </div>

          <p className="text-base leading-6 text-slate-500">
            You can add extra sets of bags at no extra cost, but you might need a bigger vehicle.
          </p>

          <div className="mt-5 rounded-[24px] bg-slate-100 p-5 text-slate-600">
            <p className="mb-4 font-semibold">Your group can bring</p>
            <div className="grid gap-4 text-base sm:grid-cols-2">
              <span className="flex items-center gap-3">
                <Luggage size={24} aria-hidden="true" />
                <strong>{booking.luggage} × checked bags</strong>
              </span>
              <span className="flex items-center gap-3">
                <Luggage size={21} aria-hidden="true" />
                <strong>{booking.luggage} × carry-on bags</strong>
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPeopleOpen(false)}
            className="mt-5 min-h-14 w-full rounded-full bg-[#FF8A05] px-6 text-lg font-bold text-[#21140A] transition hover:bg-[#E97D00] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A05] focus-visible:ring-offset-2"
          >
            Done
          </button>
        </SheetContent>
      </Sheet>

      {stage === "vehicle" && (
        serviceType === "transfer" ? <BookingResultsMap
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
          onRetry={retryRoute}
          onContinue={() => goToStage("payment")}
        /> : <section className="bg-white pb-28"><div className="mx-auto max-w-[1100px] px-5 py-12"><h1 className="text-4xl font-bold">Select your {booking.bookedHours}-hour ride</h1><div className="mt-8 grid gap-3">{pricedVehicles.map(item=><button key={item.id} onClick={()=>setVehicle(item.id)} className={`rounded-2xl border-2 p-5 text-left ${vehicle===item.id?"border-[#FF8A05] bg-[#FFF2E2]":"border-slate-200"}`}><span className="font-bold">{item.name}</span><strong className="float-right">฿{item.price.toLocaleString()}</strong></button>)}</div><button onClick={()=>goToStage("payment")} className="mt-6 min-h-14 w-full rounded-full bg-[#FF8A05] font-black">Continue</button></div></section>
      )}

      {stage === "payment" && (
        <section className="mx-auto grid max-w-[1100px] gap-6 px-5 py-12 lg:grid-cols-[1fr_360px] lg:px-10 lg:py-16">
          <div>
            <h2 className="text-3xl font-black tracking-[-.04em] sm:text-4xl">
              Passenger & payment
            </h2>
            <div className="mt-8 rounded-3xl bg-[#f3f3f3] p-6 sm:p-8">
              <h3 className="text-lg font-black">Lead passenger</h3>
              {/airport|\bBKK\b|\bDMK\b/i.test(booking.pickup) && (
                <p className="mt-2 rounded-xl bg-orange-50 px-4 py-3 text-sm font-medium text-slate-700">
                  Airport pickup: add the flight number so operations can identify arrival changes and the correct terminal.
                </p>
              )}
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <label className="text-sm font-bold">
                  First and middle names
                  <input
                    data-booking-field="name"
                    aria-invalid={Boolean(fieldErrors.name)}
                    aria-describedby={fieldErrors.name ? "name-error" : undefined}
                    required
                    value={booking.name}
                    onChange={(e) => change("name", e.target.value)}
                    className={`mt-2 h-13 w-full rounded-xl border px-4 text-base outline-none focus:border-[#FF8A05] ${fieldErrors.name ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="Given names"
                  />
                  {fieldErrors.name && <span id="name-error" className="mt-2 block text-sm font-semibold text-red-700">{fieldErrors.name}</span>}
                </label>
                <label className="text-sm font-bold">
                  Surname / family name
                  <input
                    data-booking-field="surname"
                    aria-invalid={Boolean(fieldErrors.surname)}
                    aria-describedby={fieldErrors.surname ? "surname-error" : undefined}
                    required
                    value={booking.surname}
                    onChange={(e) => change("surname", e.target.value)}
                    className={`mt-2 h-13 w-full rounded-xl border px-4 text-base outline-none focus:border-[#FF8A05] ${fieldErrors.surname ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="Family name"
                  />
                  {fieldErrors.surname && <span id="surname-error" className="mt-2 block text-sm font-semibold text-red-700">{fieldErrors.surname}</span>}
                </label>
                <label className="text-sm font-bold">
                  Confirmation email
                  <input
                    data-booking-field="email"
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? "email-error" : undefined}
                    required
                    type="email"
                    value={booking.email}
                    onChange={(e) => change("email", e.target.value)}
                    className={`mt-2 h-13 w-full rounded-xl border px-4 text-base outline-none focus:border-[#FF8A05] ${fieldErrors.email ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="you@email.com"
                  />
                  {fieldErrors.email && <span id="email-error" className="mt-2 block text-sm font-semibold text-red-700">{fieldErrors.email}</span>}
                </label>
                <label className="text-sm font-bold">
                  Phone or WhatsApp
                  <input
                    data-booking-field="phone"
                    aria-invalid={Boolean(fieldErrors.phone)}
                    aria-describedby={fieldErrors.phone ? "phone-error" : undefined}
                    required
                    type="tel"
                    value={booking.phone}
                    onChange={(e) => change("phone", e.target.value)}
                    className={`mt-2 h-13 w-full rounded-xl border px-4 text-base outline-none focus:border-[#FF8A05] ${fieldErrors.phone ? "border-red-400 bg-red-50" : "border-slate-200"}`}
                    placeholder="+66 81 234 5678"
                  />
                  {fieldErrors.phone && <span id="phone-error" className="mt-2 block text-sm font-semibold text-red-700">{fieldErrors.phone}</span>}
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
                <FlightLookup flightNumber={booking.flightNumber} flightDate={booking.date} />
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
                  data-booking-field="termsAccepted"
                  aria-invalid={Boolean(fieldErrors.termsAccepted)}
                  aria-describedby={fieldErrors.termsAccepted ? "terms-error" : undefined}
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
              {fieldErrors.termsAccepted && <p id="terms-error" role="alert" className="mt-2 text-sm font-semibold text-red-700">{fieldErrors.termsAccepted}</p>}
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
                  {payment === "card"
                    ? "You’ll continue to Stripe’s hosted checkout. Waydidi never receives or stores your card details."
                    : "Your booking will be confirmed now. Pay the driver in Thai baht at pickup."}
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
                <div role="alert" className="mt-5 rounded-2xl bg-red-50 p-4 text-sm font-semibold text-red-800">
                  <p>{error}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={continueToReview}
                      disabled={!isOnline}
                      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#21140A] px-4 text-white disabled:opacity-50"
                    >
                      <RefreshCw size={16} /> Review again
                    </button>
                    <button
                      type="button"
                      onClick={() => { setError(""); goToStage("vehicle"); }}
                      className="min-h-11 rounded-full border border-red-200 bg-white px-4 text-red-800"
                    >
                      Review trip
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => goToStage("vehicle")}
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
                label="Journey"
                value={returnTrip ? "Round trip" : serviceType === "hourly" ? `${booking.bookedHours} hours` : "One way"}
              />
              {returnTrip && (
                <>
                  <SummaryLine label="Outbound" value={`${formatCompactDate(booking.date)} · ${formatTimeLabel(booking.time)}`} />
                  <SummaryLine label="Return" value={`${formatCompactDate(returnDate)} · ${formatTimeLabel(returnTime)}`} />
                </>
              )}
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
            {returnTrip && quoteSummary?.prices[vehicle] && (
              <div className="mb-5 space-y-2 text-sm text-white/70">
                <SummaryLine label="Outbound fare" value={`฿${quoteSummary.prices[vehicle].outbound.toLocaleString()}`} />
                <SummaryLine label="Return fare" value={`฿${quoteSummary.prices[vehicle].return.toLocaleString()}`} />
              </div>
            )}
            <div className="flex items-end justify-between">
              <span className="text-sm text-white/65">Total</span>
              <span className="text-3xl font-black">
                ฿{chosenVehicle.price.toLocaleString()}
              </span>
            </div>
            <button
              onClick={continueToReview}
              disabled={!isOnline}
              className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-[#FF8A05] font-bold text-[#21140A] disabled:opacity-60"
            >
              Review booking <ArrowRight size={19} />
            </button>
          </aside>
        </section>
      )}

      {stage === "review" && (
        <section className="mx-auto grid max-w-[1100px] gap-6 px-5 py-10 pb-28 lg:grid-cols-[1fr_360px] lg:px-10 lg:py-16">
          <div>
            <p className="text-sm font-black uppercase tracking-[.16em] text-[#B85E00]">Final check</p>
            <h2 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-4xl">Review your booking</h2>
            <p className="mt-3 text-slate-600">Check the journey and passenger details before confirming. Times are shown in Thailand time.</p>

            <div className="mt-8 space-y-4">
              <ReviewSection title="Journey" onEdit={() => goToStage("search")} editLabel="Edit journey">
                <ReviewDetail label="Pickup" value={booking.pickup} />
                <ReviewDetail label="Destination" value={serviceType === "hourly" ? "Flexible hourly itinerary" : booking.dropoff} />
                <ReviewDetail label="Departure" value={`${formatCompactDate(booking.date)} · ${formatTimeLabel(booking.time)} · Thailand time`} />
                {returnTrip && <ReviewDetail label="Return" value={`${formatCompactDate(returnDate)} · ${formatTimeLabel(returnTime)} · Thailand time`} />}
                <ReviewDetail label="Travelers" value={`${booking.passengers} passengers · ${booking.luggage} luggage`} />
              </ReviewSection>

              <ReviewSection title="Ride" onEdit={() => goToStage("vehicle")} editLabel="Edit vehicle">
                <ReviewDetail label="Vehicle" value={chosenVehicle.name} />
                <ReviewDetail label="Service" value={serviceType === "hourly" ? `${booking.bookedHours}-hour private driver` : returnTrip ? "Round trip private transfer" : "One-way private transfer"} />
              </ReviewSection>

              <ReviewSection title="Passenger" onEdit={() => goToStage("payment")} editLabel="Edit passenger details">
                <ReviewDetail label="Lead passenger" value={booking.name} />
                <ReviewDetail label="Surname" value={booking.surname} />
                <ReviewDetail label="Email" value={booking.email} />
                <ReviewDetail label="Phone / WhatsApp" value={booking.phone} />
                {booking.flightNumber && <ReviewDetail label="Flight" value={booking.flightNumber.toUpperCase()} />}
                {booking.pickupSign && <ReviewDetail label="Pickup sign" value={booking.pickupSign} />}
                {booking.oversizedLuggage && <ReviewDetail label="Oversized luggage" value="Declared" />}
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
                <SummaryLine label="Outbound" value={`฿${quoteSummary.prices[vehicle].outbound.toLocaleString()}`} />
                <SummaryLine label="Return" value={`฿${quoteSummary.prices[vehicle].return.toLocaleString()}`} />
              </div>
            )}
            <div className="flex items-end justify-between">
              <span className="text-sm text-white/65">Total</span>
              <strong className="text-3xl">฿{chosenVehicle.price.toLocaleString()}</strong>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/65">The server verifies the current journey and price again before confirmation.</p>
            {error && <p role="alert" className="mt-4 rounded-xl bg-red-950/40 p-4 text-sm font-semibold text-red-100">{error}</p>}
            <button
              onClick={confirmBooking}
              disabled={loading || !isOnline}
              className="mt-6 flex h-14 w-full items-center justify-center gap-3 rounded-full bg-[#FF8A05] font-bold text-[#21140A] disabled:opacity-60"
            >
              {loading ? "Verifying booking…" : payment === "cash" ? "Confirm cash booking" : "Confirm and pay"}
              {!loading && <ArrowRight size={19} />}
            </button>
          </aside>
        </section>
      )}

      {stage === "confirmation" && (
        <section className="mx-auto max-w-[900px] px-5 py-12 lg:px-10 lg:py-16">
          <div className="booking-confirmation overflow-hidden rounded-[32px] bg-white shadow-xl shadow-orange-950/10">
            <div className="bg-[#FF8A05] p-7 text-white sm:p-10">
              <Link href="/" className="mb-8 inline-flex text-white" aria-label="Waydidi home"><WaydidiLogo className="h-20 w-auto" /></Link>
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

      {stage === "search" && (
        <>
          <ServiceCards />
          <ThailandDestinationMap />
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

function formatCompactDate(value: string) {
  return dateFromValue(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTimeLabel(value: string) {
  const option = pickupTimes.find((item) => item.value === value);
  return option?.label ?? value;
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
        <div className="border-t border-slate-200 pt-12">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.35fr_.8fr_.8fr_.8fr_.8fr]">
            <div>
              <Link
                href="/"
                className="inline-flex text-[#FF8A05]"
                aria-label="Waydidi home"
              >
                <WaydidiLogo className="h-16 w-auto" />
              </Link>
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
                { label: "Airport transfer", href: "/airport-transfer" },
                { label: "A to B", href: "/a-to-b-transfer" },
                { label: "Long journey", href: "/long-journeys" },
                { label: "Check your booking", href: "/booking/manage" },
              ]}
            />
            <FooterLinks
              title="Trips"
              links={[
                { label: "Hourly private driver", href: "/hourly-driver" },
                { label: "Airport pickup guide", href: "/airport-pickup-instructions" },
                { label: "Luggage policy", href: "/luggage-policy" },
              ]}
            />
            <FooterLinks
              title="Destinations"
              links={[
                ...destinations.map((d) => ({ label: d.name, href: `/destinations/${d.slug}` })),
                { label: "All destinations", href: destinationsHref },
              ]}
            />
            <FooterLinks
              title="Help"
              links={[
                { label: "Waydidi help", href: "/faq" },
                { label: "Cancellation policy", href: "/cancellation-refund-policy" },
                { label: "Contact us", href: "/contact" },
                { label: "Safety & security", href: "/safety-driver-standards" },
              ]}
            />
          </div>
        </div>

        <div className="mt-16 flex flex-col gap-5 border-t border-slate-200 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-x-6 gap-y-3 font-semibold">
            <Link href="/faq">Help center</Link>
            <Link href="/booking/manage">Manage booking</Link>
            <Link href="/contact">Contact Waydidi</Link>
          </div>
          <div className="flex flex-wrap gap-5">
            <Link href="/terms">Terms of Use</Link>
            <Link href="/privacy">Privacy Policy</Link>
          </div>
          <p className="text-slate-500">© 2026 Waydidi. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterLinks({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <h3 className="font-black">{title}</h3>
      <ul className="mt-5 space-y-3 text-sm text-slate-600">
        {links.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="hover:text-[#D96F00]">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DateTimePicker({
  open,
  title,
  date,
  time,
  onDateChange,
  onTimeChange,
  onOpenChange,
  onDone,
  timeLabel = "Departure time",
  min,
  minTime,
}: {
  open: boolean;
  title: string;
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  timeLabel?: string;
  min?: string;
  minTime?: string;
}) {
  const selected = dateFromValue(date);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const moveMonth = (amount: number) =>
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + amount, 1),
    );
  // A slot only counts as past when the chosen day is the earliest allowed one.
  const earliestTime = min && date === min ? minTime : undefined;
  const selectableTimes = earliestTime
    ? pickupTimes.filter((option) => option.value >= earliestTime)
    : pickupTimes;
  // Moving to today can strip the slot that was already chosen; show and commit
  // the earliest still-bookable one rather than an empty select.
  const effectiveTime = selectableTimes.some((option) => option.value === time)
    ? time
    : selectableTimes[0]?.value ?? time;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[96dvh] overflow-y-auto rounded-t-[32px] border-0 bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 text-[#17171a] data-[state=open]:duration-500 motion-reduce:duration-0 sm:px-8 lg:left-1/2 lg:max-w-3xl lg:-translate-x-1/2"
      >
        <div className="mx-auto h-1.5 w-16 rounded-full bg-slate-300" aria-hidden="true" />
        <SheetHeader className="flex-row items-center justify-between px-0 pb-3 pt-5 text-left">
          <SheetTitle className="text-[28px] font-semibold tracking-[-.03em] sm:text-[34px]">
            {title}
          </SheetTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="grid size-12 place-items-center rounded-full bg-slate-100 text-[#D96F00] transition hover:bg-orange-50"
            aria-label={`Close ${title.toLowerCase()} date selection`}
          >
            <X size={25} />
          </button>
        </SheetHeader>
        <div className="py-2 sm:px-4">
          <CalendarMonth
            month={visibleMonth}
            selected={date}
            onSelect={onDateChange}
            onPrevious={() => moveMonth(-1)}
            onNext={() => moveMonth(1)}
            min={min}
          />
        </div>
        <div className="mt-5 grid overflow-hidden rounded-2xl border border-slate-200 grid-cols-2">
          <div className="px-5 py-3">
            <span className="block text-sm font-semibold text-slate-500">
              {title} date
            </span>
            <strong className="font-semibold">{formatDateLabel(date)}</strong>
          </div>
          <label className="bg-slate-100 px-5 py-3">
            <span className="block text-sm font-semibold text-slate-500">
              {timeLabel}
            </span>
            <select
              value={effectiveTime}
              onChange={(event) => onTimeChange(event.target.value)}
              className="w-full bg-transparent text-[16px] font-semibold outline-none"
            >
              {selectableTimes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => {
            if (effectiveTime !== time) onTimeChange(effectiveTime);
            onDone();
          }}
          className="mt-6 min-h-14 w-full rounded-full bg-[#FF8A05] px-7 text-lg font-bold text-[#21140A] transition hover:bg-[#E97D00]"
        >
          Done
        </button>
      </SheetContent>
    </Sheet>
  );
}

function CalendarMonth({
  month,
  selected,
  onSelect,
  onPrevious,
  onNext,
  nextMobileOnly = false,
  min,
}: {
  month: Date;
  selected: string;
  onSelect: (value: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  nextMobileOnly?: boolean;
  min?: string;
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
  // Day 0 of this month is the last day of the previous one. If even that sits
  // before the minimum, there is nothing selectable back there.
  const atMinMonth = Boolean(
    min && dateValue(new Date(month.getFullYear(), month.getMonth(), 0)) < min,
  );

  return (
    <div>
      <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
        {onPrevious ? (
          <button
            type="button"
            onClick={onPrevious}
            disabled={atMinMonth}
            className="grid size-11 place-items-center rounded-full bg-slate-100 transition disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
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
              const disabled = Boolean(min) && value < min!;
              return (
                <button
                  type="button"
                  key={value}
                  disabled={disabled}
                  aria-disabled={disabled}
                  onClick={() => onSelect(value)}
                  className={`mx-auto grid size-10 place-items-center rounded-full text-[16px] transition ${active ? "bg-[#FF8A05] font-bold text-[#21140A]" : disabled ? "cursor-not-allowed text-slate-300" : "hover:bg-orange-100"}`}
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
      href: "/a-to-b-transfer",
      text: "Go anywhere in Thailand with Waydidi. Reserve your private ride, hop in, and enjoy.",
      image: "/service-ride-orange.png",
      alt: "Orange Waydidi private car",
    },
    {
      title: "Reserve",
      href: "/faq",
      text: "Reserve your ride in advance so you can relax on the day of your trip.",
      image: "/service-reserve.png",
      alt: "Reservation calendar",
    },
    {
      title: "Day trips",
      href: "/hourly-driver",
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
      <h2 className="whitespace-nowrap text-[23.67px] font-bold tracking-[-.04em] sm:text-[2rem]">
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
            <Link
              href={card.href}
              className="absolute bottom-4 left-5 z-10 inline-flex rounded-full bg-white px-4 py-2 text-sm font-bold transition hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF8A05]"
            >
              Details
              <span className="sr-only"> about {card.title}</span>
            </Link>
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

const thailandDotColumnsByRow = [
  [8,9],
  [6,7,8,9,10],
  [2,4,5,6,7,8,9],
  [2,3,4,5,6,7,8,9,10,11,12],
  [2,3,4,5,6,7,8,9,10,11,12],
  [1,2,3,4,5,6,7,8,9,10,11,12],
  [0,1,2,3,4,5,6,7,8,9,10,11],
  [1,2,3,4,5,6,7,8,9,10,11,15,18,19,20],
  [1,2,3,4,5,6,7,8,9,10,11,13,14,15,16,17,18,19,20,21],
  [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
  [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
  [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
  [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22],
  [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23],
  [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24],
  [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25],
  [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24],
  [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25],
  [3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25],
  [4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,24],
  [5,6,7,8,9,10,11,12,13,14,15,16],
  [6,7,8,9,10,11,12,13,14,15,16],
  [6,7,8,11,12,13,14,15],
  [6,7,8,11,12,13,14,15],
  [6,7,8,11,12,13,14,15,16],
  [7,8,15,16],
  [7,8,15,17],
  [7,16,17],
  [7],
  [6],
  [5,6],
  [5],
  [4,5],
  [4,5,8],
  [4,5],
  [3,4,5,6,7],
  [3,4,5,6,7,8],
  [3,4,5,6,7,8,9],
  [4,5,6,7,8,9],
  [3,6,7,8,9],
  [5,6,7,8,9],
  [7,8,9,10],
  [8,9,10,11,12,13],
  [7,10,11,12,13],
  [12,13,14],
  [11,12,14],
] as const;

const destinationMarkers = [
  { name: "Chiang Mai", row: 7, column: 4, kind: "long", slug: "chiang-mai", href: "/destinations", bookingValue: "Chiang Mai", route: "Bangkok → Chiang Mai", duration: "Around 9 hours", color: "#5b3d24", intro: "A long private journey north to Chiang Mai hotels, homes and meeting points." },
  { name: "Kanchanaburi", row: 16, column: 5, kind: "popular", slug: "kanchanaburi", href: "/destinations/kanchanaburi", bookingValue: "Kanchanaburi", route: "Bangkok → Kanchanaburi", duration: "Around 2.5 hours", color: "#574322", intro: "Private travel to the River Kwai area, riverside resorts and park gateways." },
  { name: "Ayutthaya", row: 15, column: 10, kind: "popular", slug: "ayutthaya", href: "/destinations/ayutthaya", bookingValue: "Ayutthaya", route: "Bangkok → Ayutthaya", duration: "Around 1.5 hours", color: "#6e3e24", intro: "A comfortable ride to Thailand's ancient capital, hotels and historic area." },
  { name: "Don Mueang Airport", row: 16, column: 11, kind: "airport", slug: "don-mueang-airport", href: "/airport-transfer", bookingValue: "Don Mueang International Airport (DMK)", route: "Don Mueang → Bangkok", duration: "Around 45–75 minutes", color: "#3b4656", intro: "Pre-booked airport pickup with clear passenger and meeting information." },
  { name: "Bangkok", row: 18, column: 12, kind: "popular", slug: "bangkok", href: "/destinations/bangkok", bookingValue: "Bangkok", route: "Bangkok private transfer", duration: "Door-to-door", color: "#40230f", intro: "Private connections between airports, hotels, homes and business districts." },
  { name: "Suvarnabhumi Airport", row: 18, column: 14, kind: "airport", slug: "suvarnabhumi-airport", href: "/airport-transfer", bookingValue: "Suvarnabhumi Airport (BKK)", route: "Suvarnabhumi → Bangkok", duration: "Around 45–90 minutes", color: "#26394f", intro: "A calm airport arrival with your pickup and destination confirmed in advance." },
  { name: "Pattaya", row: 20, column: 16, kind: "popular", slug: "pattaya", href: "/destinations/pattaya", bookingValue: "Pattaya", route: "Bangkok → Pattaya", duration: "Around 2 hours", color: "#153c72", intro: "Direct private transfers to Pattaya, Jomtien and Eastern Seaboard hotels." },
  { name: "Hua Hin", row: 23, column: 11, kind: "popular", slug: "hua-hin", href: "/destinations/hua-hin", bookingValue: "Hua Hin", route: "Bangkok → Hua Hin", duration: "Around 3 hours", color: "#7a4c1e", intro: "Travel directly to Hua Hin, Cha-am and nearby Gulf-side resorts." },
  { name: "Koh Chang", row: 19, column: 24, kind: "long", slug: "koh-chang", href: "/destinations/koh-chang", bookingValue: "Koh Chang", route: "Bangkok → Koh Chang", duration: "Around 6–7 hours", color: "#0d5c58", intro: "A ferry-aware road journey with resort delivery on Koh Chang." },
  { name: "Koh Kood", row: 18, column: 25, kind: "long", slug: "koh-kood", href: "/destinations/koh-kood", bookingValue: "Laem Sok Pier, Trat", route: "Bangkok → Koh Kood pier", duration: "Around 6 hours", color: "#14666f", intro: "Reach the correct Trat mainland pier in time for your Koh Kood boat." },
  { name: "Krabi", row: 39, column: 8, kind: "long", slug: "krabi", href: "/destinations/krabi", bookingValue: "Krabi", route: "Phuket → Krabi", duration: "Around 3 hours", color: "#345d36", intro: "Connect Krabi Airport, Ao Nang, Krabi Town and mainland piers." },
  { name: "Phuket", row: 38, column: 5, kind: "popular", slug: "phuket", href: "/destinations/phuket", bookingValue: "Phuket", route: "Phuket Airport → hotel", duration: "Around 45–90 minutes", color: "#0f4c4c", intro: "Private transfers from Phuket Airport to beaches, marinas and resorts." },
] as const;

type DestinationMarker = (typeof destinationMarkers)[number];

const destinationVisuals: Record<string, { image: string; position: string }> = {
  "chiang-mai": { image: "/hero-driver-customer.webp", position: "82% center" },
  kanchanaburi: { image: "/waydidi-transfer.png", position: "18% center" },
  ayutthaya: { image: "/hero-driver-customer.webp", position: "88% center" },
  "don-mueang-airport": { image: "/hero-driver-customer.webp", position: "70% center" },
  bangkok: { image: "/hero-driver-customer.webp", position: "92% center" },
  "suvarnabhumi-airport": { image: "/waydidi-transfer.png", position: "74% center" },
  pattaya: { image: "/waydidi-transfer.png", position: "42% center" },
  "hua-hin": { image: "/waydidi-transfer.png", position: "25% center" },
  "koh-chang": { image: "/waydidi-transfer.png", position: "58% center" },
  "koh-kood": { image: "/waydidi-transfer.png", position: "34% center" },
  krabi: { image: "/waydidi-transfer.png", position: "67% center" },
  phuket: { image: "/waydidi-transfer.png", position: "82% center" },
};

function ThailandDestinationMap() {
  const [activeSlug, setActiveSlug] = useState("bangkok");
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const activeDestination = destinationMarkers.find((destination) => destination.slug === activeSlug) ?? destinationMarkers[4];
  const activeVisual = destinationVisuals[activeDestination.slug] ?? destinationVisuals.bangkok;

  return (
    <section
      aria-labelledby="destination-map-heading"
      className="overflow-hidden bg-white py-16 sm:py-20 lg:py-24"
    >
      <div className="mx-auto max-w-[1180px] px-5 lg:px-10">
        <div className="grid items-start gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
          <div className="pt-1 lg:sticky lg:top-28">
            <h2
              id="destination-map-heading"
              className="max-w-[460px] text-[23.67px] font-bold tracking-[-.04em] text-[#211726] sm:text-[2rem]"
            >
              Where Waydidi takes you
            </h2>
          </div>

          <div>
            <div className="relative mx-auto aspect-[4/5] w-full max-w-[620px]" aria-label="Map of Waydidi destinations in Thailand">
              <div className="absolute inset-[3%_6%_1%_4%]">
                <svg
                  className="h-full w-full overflow-visible"
                  viewBox="280 30 720 1230"
                  role="img"
                  aria-label="Dotted map of Thailand"
                >
                  {thailandDotColumnsByRow.flatMap((columns, row) =>
                    columns.map((column) => (
                      <circle
                        key={`${row}-${column}`}
                        cx={318 + column * 26}
                        cy={58 + row * 26}
                        r="6.2"
                        fill="#737373"
                      />
                    )),
                  )}

                  {[...destinationMarkers]
                    .sort((a, b) => Number(a.slug === expandedSlug) - Number(b.slug === expandedSlug))
                    .map((destination, index) => {
                    const active = destination.slug === activeSlug;
                    const expanded = destination.slug === expandedSlug;
                    const cx = 318 + destination.column * 26;
                    const cy = 58 + destination.row * 26;
                    const labelWidth = Math.max(126, destination.name.length * 13 + 48);

                    return (
                      <g
                        key={destination.name}
                        role="button"
                        tabIndex={0}
                        aria-label={`Show ${destination.name}`}
                        aria-pressed={active}
                        className="destination-map-marker cursor-pointer outline-none"
                        onClick={() => {
                          setActiveSlug(destination.slug);
                          setExpandedSlug(destination.slug);
                        }}
                        onMouseEnter={() => {
                          setActiveSlug(destination.slug);
                          setExpandedSlug(destination.slug);
                        }}
                        onMouseLeave={() => setExpandedSlug(null)}
                        onFocus={() => {
                          setActiveSlug(destination.slug);
                          setExpandedSlug(destination.slug);
                        }}
                        onBlur={() => setExpandedSlug(null)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setActiveSlug(destination.slug);
                            setExpandedSlug(destination.slug);
                          }
                        }}
                      >
                        <circle
                          className="destination-marker-pulse"
                          cx={cx}
                          cy={cy}
                          r="19.5"
                          style={{ animationDelay: `${index * 140}ms` }}
                        />
                        <rect
                          x={cx - labelWidth}
                          y={cy - 25}
                          width={labelWidth + 24}
                          height="50"
                          rx="25"
                          className={`destination-marker-label ${expanded ? "destination-marker-label--open" : ""}`}
                          style={{ transformOrigin: `${cx}px ${cy}px` }}
                        />
                        <text
                          x={cx - labelWidth + 22}
                          y={cy + 7}
                          className={`destination-marker-name ${expanded ? "destination-marker-name--open" : ""}`}
                        >
                          {destination.name}
                        </text>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={active ? 18.2 : 15.6}
                          className={`destination-marker-dot ${expanded ? "destination-marker-dot--open" : ""}`}
                        />
                      </g>
                    );
                  })}
                </svg>

                <div className="pointer-events-none absolute bottom-[1%] right-[-3%] aspect-square w-[48%] sm:w-[44%]">
                  <div className="absolute left-[13%] top-[1%] size-[72%] overflow-hidden rounded-full border-[5px] border-white bg-slate-100 shadow-[0_16px_38px_rgba(33,23,38,.14)]">
                    <img
                      key={activeDestination.slug}
                      src={activeVisual.image}
                      alt=""
                      className="h-full w-full object-cover animate-in fade-in zoom-in-95 duration-500"
                      style={{ objectPosition: activeVisual.position }}
                    />
                    <div className="absolute inset-0 mix-blend-multiply opacity-10" style={{ backgroundColor: activeDestination.color }} />
                  </div>
                  <img
                    src="/vehicle-comfort-suv.webp"
                    alt="Waydidi private transfer vehicle"
                    className="absolute bottom-0 left-0 z-10 w-full drop-shadow-[0_16px_12px_rgba(33,23,38,.18)]"
                  />
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="mt-12 sm:mt-16">
          <DestinationColumn
            title="Cities"
            items={destinationMarkers}
            color="#ff8a05"
            activeSlug={activeSlug}
            onSelect={setActiveSlug}
            onExpand={setExpandedSlug}
            onCollapse={() => setExpandedSlug(null)}
          />
        </div>
      </div>
    </section>
  );
}

function DestinationColumn({ title, items, color, ring = false, activeSlug, onSelect, onExpand, onCollapse }: { title: string; items: readonly DestinationMarker[]; color: string; ring?: boolean; activeSlug: string; onSelect: (slug: string) => void; onExpand: (slug: string) => void; onCollapse: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const panelId = `destination-${title.toLowerCase().replace(/\s+/g, "-")}-panel`;

  const destinationItems = (className: string) => (
    <ul className={className}>
      {items.map((item) => (
        <li key={item.slug}>
          <button
            type="button"
            onClick={() => {
              onSelect(item.slug);
              onExpand(item.slug);
            }}
            onMouseEnter={() => {
              onSelect(item.slug);
              onExpand(item.slug);
            }}
            onMouseLeave={onCollapse}
            onFocus={() => {
              onSelect(item.slug);
              onExpand(item.slug);
            }}
            onBlur={onCollapse}
            className={`px-2 py-1.5 text-left transition-colors focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#ff8a05] ${activeSlug === item.slug ? "font-black text-black" : "hover:text-black"}`}
          >
            {item.name}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <div className="lg:hidden">
        <h3>
          <button
            type="button"
            aria-expanded={isOpen}
            aria-controls={panelId}
            onClick={() => setIsOpen((open) => !open)}
            className="flex w-full items-center justify-between border-y border-[#a7adb6] py-6 text-left text-sm font-black uppercase tracking-[.13em] text-[#211726] transition-colors hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#ff8a05] sm:py-7"
          >
            <span className="flex items-center gap-4">
              <span className={`size-3 rounded-full ${ring ? "border-[3px] border-[#ff8a05]" : ""}`} style={{ backgroundColor: color }} />
              {title}
            </span>
            <span className="relative mr-1 block size-7" aria-hidden="true">
              <span className="absolute left-0 top-1/2 h-[2px] w-7 -translate-y-1/2 rounded-full bg-[#211726]" />
              <span className={`absolute left-1/2 top-0 h-7 w-[2px] -translate-x-1/2 rounded-full bg-[#211726] transition-transform duration-300 ease-out ${isOpen ? "scale-y-0" : "scale-y-100"}`} />
            </span>
          </button>
        </h3>
        <div id={panelId} className={`grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(.22,1,.36,1)] ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}>
          <div className="overflow-hidden">
            {destinationItems("grid grid-cols-2 gap-x-5 gap-y-2.5 py-7 text-[15px] font-semibold text-slate-600 sm:grid-cols-3 sm:py-8")}
          </div>
        </div>
      </div>

      <div className="hidden lg:block">
        <h3 className="flex items-center gap-4 text-sm font-black uppercase tracking-[.13em] text-[#211726]">
          <span className={`size-3 rounded-full ${ring ? "border-[3px] border-[#ff8a05]" : ""}`} style={{ backgroundColor: color }} />
          {title}
        </h3>
        {destinationItems("mt-6 grid grid-cols-4 gap-x-5 gap-y-2.5 text-[15px] font-semibold text-slate-600")}
      </div>
    </div>
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

function SheetCounter({
  label,
  description,
  value,
  min,
  onChange,
}: {
  label: string;
  description: string;
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
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
          className="grid size-11 place-items-center rounded-full text-slate-700 transition hover:bg-orange-50 hover:text-[#D96F00] disabled:cursor-not-allowed disabled:text-slate-300"
          aria-label={`Remove ${label.toLowerCase()}`}
        >
          <Minus size={19} />
        </button>
        <strong className="w-10 text-center text-xl">{value}</strong>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="grid size-11 place-items-center rounded-full text-slate-700 transition hover:bg-orange-50 hover:text-[#D96F00]"
          aria-label={`Add ${label.toLowerCase()}`}
        >
          <Plus size={19} />
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
  const active = stage === "vehicle" ? 1 : stage === "payment" ? 2 : stage === "review" ? 3 : 4;
  const steps = ["Select ride", "Passenger", "Review", "Confirmation"];
  return (
    <div
      className={`${inHeader ? "ml-auto w-[min(520px,calc(100vw-120px))]" : "mx-auto max-w-3xl"} flex items-start justify-end`}
    >
      {steps.map(
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
            {index < steps.length - 1 && (
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
        <button type="button" onClick={onEdit} aria-label={editLabel} className="min-h-11 rounded-full bg-orange-50 px-4 text-sm font-bold text-[#B85E00]">
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
