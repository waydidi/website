"use client";
import { FormEvent, useEffect, useState } from "react";
import {
  CalendarClock,
  CarFront,
  CheckCircle2,
  LogOut,
  RefreshCw,
  Search,
  ShieldCheck,
  TicketX,
} from "lucide-react";
import { GoogleRoutePicker, type RouteInfo } from "@/components/google-route-picker";
type Booking = {
  tripPin: string;
  tripKey?: string;
  reference: string;
  status: string;
  pickup: string;
  dropoff: string;
  pickupDate: string;
  pickupTime: string;
  returnDate: string | null;
  returnTime: string | null;
  passengers: number;
  luggage: number;
  vehicle: string;
  total: number;
  paymentMethod: string;
  serviceType: string;
  bookedHours: number | null;
  refundStatus: string | null;
  cancellationReason: string | null;
  bookingVersion: number;
};
type ChangeRequest = {
  id: string;
  status: string;
  pickup: string;
  dropoff: string;
  pickupDate: string;
  pickupTime: string;
  vehicleName: string;
  originalTotal: number;
  revisedTotal: number;
  priceDifference: number;
  reason: string | null;
  createdAt: string;
};
type FareQuote = { quoteId: string; distanceMeters: number; durationSeconds: number; prices: Record<string, { total: number }> };
type ManageData = {
  booking: Booking;
  eligibility: { canReschedule: boolean; canCancel: boolean };
  changeRequests: ChangeRequest[];
};
type Tab = "details" | "reschedule" | "cancel";
export default function BookingLookup() {
  const [reference, setReference] = useState(""),
    [surname, setSurname] = useState(""),
    [data, setData] = useState<ManageData | null>(null),
    [tab, setTab] = useState<Tab>("details"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [date, setDate] = useState(""),
    [time, setTime] = useState("09:00"),
    [newPickup, setNewPickup] = useState(""),
    [newDropoff, setNewDropoff] = useState(""),
    [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null),
    [fareQuote, setFareQuote] = useState<FareQuote | null>(null),
    [returnFareQuote, setReturnFareQuote] = useState<FareQuote | null>(null),
    [vehicleId, setVehicleId] = useState("economy_sedan"),
    [changeReason, setChangeReason] = useState("");
  async function load() {
    const r = await fetch("/api/bookings/manage", { cache: "no-store" });
    if (!r.ok) {
      setData(null);
      return;
    }
    const value = (await r.json()) as ManageData;
    setData(value);
    setDate(value.booking.pickupDate);
    setTime(value.booking.pickupTime);
    setNewPickup(value.booking.pickup);
    setNewDropoff(value.booking.dropoff);
  }
  useEffect(() => {
    // Restore an existing secure management session after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().catch(() => undefined);
  }, []);
  async function signIn(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const r = await fetch("/api/bookings/manage/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reference, surname }),
    });
    const value = (await r.json()) as { error?: string };
    setLoading(false);
    if (!r.ok) {
      setError(value.error ?? "Booking could not be opened.");
      return;
    }
    await load();
  }
  async function action(path: string, body: Record<string, unknown>) {
    setLoading(true);
    setError("");
    setMessage("");
    const r = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const value = (await r.json()) as { error?: string };
    setLoading(false);
    if (!r.ok) {
      setError(value.error ?? "The change could not be completed.");
      return;
    }
    await load();
    setMessage(
      path.endsWith("change-request")
          ? "Your journey-change request was sent to Waydidi for review. Your confirmed booking has not changed."
          : "Your pickup date and time have been updated.",
    );
  }
  async function signOut() {
    await fetch("/api/bookings/manage/session", { method: "DELETE" });
    setData(null);
    setReference("");
    setSurname("");
  }
  async function calculateChangedRoute(info: RouteInfo | null) {
    setRouteInfo(info);
    setFareQuote(null);
    setReturnFareQuote(null);
    setError("");
    if (!info?.pickupPlaceId || !info.dropoffPlaceId) return;
    setLoading(true);
    try {
      const response = await fetch("/api/fare-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pickupPlaceId: info.pickupPlaceId,
          dropoffPlaceId: info.dropoffPlaceId,
          pickupDate: date,
          pickupTime: time,
          timezone: "Asia/Bangkok",
        }),
      });
      const value = await response.json() as FareQuote & { error?: string };
      if (!response.ok) throw new Error(value.error ?? "The revised route could not be priced.");
      setFareQuote(value);
      if (data?.booking.returnDate && data.booking.returnTime) {
        const returnResponse = await fetch("/api/fare-quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pickupPlaceId: info.dropoffPlaceId, dropoffPlaceId: info.pickupPlaceId, pickupDate: data.booking.returnDate, pickupTime: data.booking.returnTime, timezone: "Asia/Bangkok" }),
        });
        const returnValue = await returnResponse.json() as FareQuote & { error?: string };
        if (!returnResponse.ok) throw new Error(returnValue.error ?? "The revised return route could not be priced.");
        setReturnFareQuote(returnValue);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The revised route could not be priced.");
    } finally {
      setLoading(false);
    }
  }
  async function submitJourneyChange() {
    if (!fareQuote || !routeInfo) return;
    await action("/api/bookings/manage/change-request", {
      fareQuoteId: fareQuote.quoteId,
      returnFareQuoteId: returnFareQuote?.quoteId,
      vehicleId,
      bookingVersion: data?.booking.bookingVersion,
      reason: changeReason,
    });
    setFareQuote(null);
  }
  if (!data)
    return (
      <main className="min-h-[calc(100vh-102px)] bg-slate-50 px-5 py-12 text-[#211726]">
        <section className="mx-auto max-w-md rounded-[28px] border border-slate-200 bg-white p-7 shadow-sm">
          <span className="grid size-12 place-items-center rounded-full bg-orange-50 text-[#D96F00]">
            <ShieldCheck />
          </span>
          <h1 className="mt-5 text-3xl font-black tracking-[-.04em]">
            Manage your booking
          </h1>
          <p className="mt-3 leading-7 text-slate-600">
            Enter your booking reference and the lead passenger’s surname.
          </p>
          <form onSubmit={signIn} className="mt-7 space-y-5">
            <label className="block text-sm font-bold">
              Booking reference
              <input
                required
                value={reference}
                onChange={(e) => setReference(e.target.value.toUpperCase())}
                placeholder="A7K9Q2"
                maxLength={15}
                className="mt-2 h-13 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-base uppercase outline-none focus:border-[#FF8A05]"
              />
            </label>
            <label className="block text-sm font-bold">
              Lead passenger surname
              <input
                required
                value={surname}
                onChange={(e) => setSurname(e.target.value)}
                placeholder="Family name"
                className="mt-2 h-13 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-base outline-none focus:border-[#FF8A05]"
              />
            </label>
            {error && (
              <p
                role="alert"
                className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700"
              >
                {error}
              </p>
            )}
            <button
              disabled={loading}
              className="flex h-13 w-full items-center justify-center gap-2 rounded-full bg-[#FF8A05] font-bold text-white disabled:opacity-60"
            >
              <Search size={18} />
              {loading ? "Opening…" : "Open booking"}
            </button>
          </form>
        </section>
      </main>
    );
  const b = data.booking;
  const revisedTotal = fareQuote?.prices[vehicleId]
    ? fareQuote.prices[vehicleId].total + (returnFareQuote?.prices[vehicleId]?.total ?? 0)
    : null;
  const tabs: [Tab, string, typeof CarFront][] = [
    ["details", "Booking details", CarFront],
    ["reschedule", "Change date & time", CalendarClock],
    ["cancel", "Cancel booking", TicketX],
  ];
  const cancellationText =
    b.status === "cancelled"
      ? b.refundStatus
        ? `This booking is cancelled. Refund status: ${b.refundStatus.replaceAll("_", " ")}.`
        : "This booking is cancelled."
      : "";
  return (
    <main className="min-h-[calc(100vh-102px)] bg-[#f4f6f8] px-4 py-8 text-[#211726] sm:px-6 lg:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[.15em] text-[#D96F00]">
              Booking {b.reference}
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-[-.04em] sm:text-4xl">
              Manage your journey
            </h1>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold"
          >
            <LogOut size={16} />
            Close securely
          </button>
        </div>
        {message && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl bg-emerald-100 p-4 font-semibold text-emerald-800">
            <CheckCircle2 />
            {message}
          </div>
        )}
        {error && (
          <div
            role="alert"
            className="mb-5 rounded-2xl bg-red-50 p-4 font-semibold text-red-700"
          >
            {error}
          </div>
        )}
        <div className="grid gap-6 lg:grid-cols-[270px_1fr]">
          <aside className="rounded-3xl bg-[#211726] p-3 text-white lg:sticky lg:top-[126px] lg:self-start">
            <div className="mb-2 rounded-2xl bg-white/10 p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-white/60">
                Current status
              </p>
              <p className="mt-1 text-lg font-black capitalize">
                {b.status.replaceAll("_", " ")}
              </p>
            </div>
            <nav className="flex gap-2 overflow-x-auto lg:grid">
              {tabs.map(([id, label, Icon]) => (
                <button
                  key={id}
                  onClick={() => {
                    setTab(id);
                    setError("");
                    setMessage("");
                  }}
                  className={`flex shrink-0 items-center gap-3 rounded-2xl px-4 py-3.5 text-left font-bold ${tab === id ? "bg-[#FF8A05]" : "text-white/75 hover:bg-white/10"}`}
                >
                  <Icon size={19} />
                  {label}
                </button>
              ))}
            </nav>
          </aside>
          <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            {tab === "details" && (
              <>
                <Heading icon={CarFront} title="Booking details" />
                <div className="mt-6 rounded-3xl bg-[#FFF0DE] p-6 text-center">
                  <p className="text-xs font-black uppercase tracking-[.16em] text-[#B85E00]">Trip PIN</p>
                  <p className="mt-2 text-4xl font-black tracking-[.25em]">{b.tripPin}</p>
                  <p className="mt-2 text-sm text-slate-600">Give this PIN to your driver only when you meet at pickup.</p>
                </div>
                {b.status === "confirmed" && (
                  <a href={`/trip/${encodeURIComponent(b.reference)}${b.tripKey ? `?key=${b.tripKey}` : ""}`} className="mt-4 flex h-12 items-center justify-center gap-2 rounded-full bg-[#211726] px-6 font-bold text-white">
                    Track your trip
                  </a>
                )}
                <div className="mt-7 grid gap-6 sm:grid-cols-2">
                  <Detail label="Pickup" value={b.pickup} />
                  <Detail label="Drop-off" value={b.dropoff} />
                  <Detail
                    label="Date & time"
                    value={`${b.pickupDate} at ${b.pickupTime}`}
                  />
                  <Detail label="Vehicle" value={b.vehicle} />
                  <Detail
                    label="Travelers"
                    value={`${b.passengers} passengers · ${b.luggage} bags`}
                  />
                  <Detail
                    label="Service"
                    value={
                      b.serviceType === "hourly"
                        ? `${b.bookedHours}-hour private driver`
                        : "Private transfer"
                    }
                  />
                </div>
                <div className="mt-8 flex items-end justify-between border-t border-slate-200 pt-6">
                  <span className="font-bold text-slate-500">
                    Booking total
                  </span>
                  <strong className="text-3xl">
                    ฿{b.total.toLocaleString()}
                  </strong>
                </div>
              </>
            )}
            {tab === "reschedule" && (
              <>
                <Heading icon={CalendarClock} title="Request a journey change" />
                <p className="mt-3 text-slate-600">
                  Select the new route and schedule. Waydidi will calculate the revised fare from current pricing before you submit the request. Your confirmed booking stays unchanged until approval.
                </p>
                {data.changeRequests[0]?.status === "pending" && (
                  <Policy text={`Your request for ${data.changeRequests[0].pickup} → ${data.changeRequests[0].dropoff} is awaiting review. Revised total: ฿${data.changeRequests[0].revisedTotal.toLocaleString()}.`} />
                )}
                <div className="mt-7 grid gap-4 rounded-2xl border border-slate-200 p-4 sm:grid-cols-2">
                  <GoogleRoutePicker
                    pickup={newPickup}
                    dropoff={newDropoff}
                    onPickupChange={(value) => { setNewPickup(value); setFareQuote(null); setReturnFareQuote(null); }}
                    onDropoffChange={(value) => { setNewDropoff(value); setFareQuote(null); setReturnFareQuote(null); }}
                    onRouteChange={calculateChangedRoute}
                  />
                </div>
                <div className="mt-7 grid gap-5 sm:grid-cols-2">
                  <label className="font-bold">
                    New pickup date
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => { setDate(e.target.value); setFareQuote(null); }}
                      className="mt-2 h-13 w-full rounded-xl border border-slate-200 bg-slate-50 px-4"
                    />
                  </label>
                  <label className="font-bold">
                    New pickup time
                    <select
                      value={time}
                      onChange={(e) => { setTime(e.target.value); setFareQuote(null); }}
                      className="mt-2 h-13 w-full rounded-xl border border-slate-200 bg-slate-50 px-4"
                    >
                      {times().map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </label>
                  <label className="font-bold">
                    Vehicle
                    <select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="mt-2 h-13 w-full rounded-xl border border-slate-200 bg-slate-50 px-4">
                      <option value="economy_sedan">Economy sedan</option>
                      <option value="comfort_bmw">Comfort BMW</option>
                      <option value="comfort_suv">Comfort SUV</option>
                      <option value="premium_minivan">Premium minivan</option>
                    </select>
                  </label>
                  <label className="font-bold sm:col-span-2">
                    Reason <span className="font-normal text-slate-400">(optional)</span>
                    <textarea value={changeReason} onChange={(e) => setChangeReason(e.target.value)} maxLength={300} rows={3} className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 p-4" placeholder="Tell Waydidi what you need to change" />
                  </label>
                </div>
                {routeInfo && !fareQuote && (
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-orange-50 p-4 text-sm font-semibold text-[#8A4700]">
                    <span>Route selected. Calculate again after changing the date or time.</span>
                    <button type="button" onClick={() => calculateChangedRoute(routeInfo)} disabled={loading} className="min-h-11 rounded-full bg-[#21140A] px-5 text-white disabled:opacity-50">
                      {loading ? "Calculating…" : "Calculate revised fare"}
                    </button>
                  </div>
                )}
                {revisedTotal !== null && (
                  <div className="mt-6 rounded-2xl bg-[#071c61] p-5 text-white">
                    <p className="text-sm text-white/65">Revised journey · {((fareQuote?.distanceMeters ?? 0) / 1000).toFixed(1)} km</p>
                    <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                      <div><span className="block text-white/55">Current</span><strong>฿{b.total.toLocaleString()}</strong></div>
                      <div><span className="block text-white/55">Revised</span><strong>฿{revisedTotal.toLocaleString()}</strong></div>
                      <div><span className="block text-white/55">Difference</span><strong>{revisedTotal - b.total >= 0 ? "+" : "−"}฿{Math.abs(revisedTotal - b.total).toLocaleString()}</strong></div>
                    </div>
                  </div>
                )}
                {!data.eligibility.canReschedule && (
                  <Policy text="Online changes are closed for this booking. Contact Waydidi for assistance." />
                )}
                <button
                  disabled={
                    !data.eligibility.canReschedule ||
                    loading ||
                    !fareQuote ||
                    (Boolean(b.returnDate) && !returnFareQuote) ||
                    data.changeRequests[0]?.status === "pending"
                  }
                  onClick={submitJourneyChange}
                  className="mt-7 flex h-13 items-center gap-2 rounded-full bg-[#FF8A05] px-7 font-bold text-white disabled:opacity-40"
                >
                  <RefreshCw size={18} />
                  {loading ? "Submitting…" : "Submit change request"}
                </button>
              </>
            )}
            {tab === "cancel" && (
              <>
                <Heading icon={TicketX} title="Cancel booking" />
                {b.status === "cancelled" ? (
                  <Policy text={cancellationText} />
                ) : (
                  <>
                    <p className="mt-3 leading-7 text-slate-600">
                      To cancel, or to ask about a refund, email Waydidi with your booking reference. We reply by email.
                    </p>
                    <a
                      href={`mailto:support@waydidi.com?subject=${encodeURIComponent(`Cancel booking ${b.reference}`)}&body=${encodeURIComponent(`Booking reference: ${b.reference}\nPickup: ${b.pickupDate} ${b.pickupTime}\nReason:\n`)}`}
                      className="mt-6 inline-flex h-13 items-center rounded-full bg-[#211726] px-7 font-bold text-white"
                    >
                      Email support@waydidi.com
                    </a>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
function Heading({
  icon: Icon,
  title,
}: {
  icon: typeof CarFront;
  title: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-12 place-items-center rounded-full bg-orange-50 text-[#D96F00]">
        <Icon />
      </span>
      <h2 className="text-2xl font-black">{title}</h2>
    </div>
  );
}
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-[.13em] text-slate-400">
        {label}
      </p>
      <p className="mt-2 font-bold leading-6">{value}</p>
    </div>
  );
}
function Policy({ text }: { text: string }) {
  return (
    <p className="mt-6 rounded-2xl bg-amber-50 p-4 font-semibold text-amber-900">
      {text}
    </p>
  );
}
function times() {
  return Array.from(
    { length: 96 },
    (_, i) =>
      `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`,
  );
}
