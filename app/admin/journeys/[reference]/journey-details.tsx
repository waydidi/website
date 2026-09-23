"use client";

import {
  ArrowLeft,
  Camera,
  Check,
  Clipboard,
  ExternalLink,
  MapPin,
  Navigation,
  Phone,
  Route,
  Save,
  Truck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Booking = {
  reference: string;
  customerName: string;
  customerPhone: string;
  pickup: string;
  dropoff: string;
  pickupDate: string;
  pickupTime: string;
  vehicle: string;
  total: number;
  status: string;
};
type Driver = { id: string; fullName: string; phone: string };
type Assignment = {
  id: string;
  bookingReference: string;
  driverId: string;
  currentStatus: string;
  revokedAt: string | null;
  passengerVerifiedAt: string | null;
  passengerVerificationMethod: string | null;
};
type Event = {
  id: string;
  bookingReference: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  accuracyMetres: number | null;
  evidenceKey: string | null;
  verificationStatus: string;
  createdAt: string;
};
type JourneyLocation = { id: string; bookingReference: string; latitude: number; longitude: number; accuracyMetres: number; serverTimestamp: string; quality: string };
type JourneyException = { id: string; bookingReference: string; exceptionType: string; status: string; distanceMetres: number; corridorMetres: number; stopDurationSeconds: number | null; stopReason: string | null; startedAt: string; lastSeenAt: string; resolvedAt: string | null };
type Cost = {
  bookingReference: string;
  agreedDriverCost: number;
  additionalCosts: number;
  totalDriverCost: number;
  paymentStatus: string;
  paymentReference: string | null;
  notes: string | null;
};
const labels: Record<string, string> = {
  assigned: "Assigned",
  going_to_standby: "Going to standby",
  standby: "Standing by",
  passenger_verified: "Passenger verified — waiting to depart",
  trip_started: "Trip active — passenger onboard",
  passenger_picked_up: "Passenger picked up",
  completed: "Drop-off completed",
};
const money = (n: number) => `฿${n.toLocaleString("en-US")}`;

export default function JourneyDetails({ reference }: { reference: string }) {
  const [booking, setBooking] = useState<Booking | null>(null),
    [driver, setDriver] = useState<Driver | null>(null),
    [assignment, setAssignment] = useState<Assignment | null>(null),
    [events, setEvents] = useState<Event[]>([]),
    [latestLocation, setLatestLocation] = useState<JourneyLocation | null>(null),
    [journeyExceptions, setJourneyExceptions] = useState<JourneyException[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [cost, setCost] = useState({
    agreedDriverCost: "0",
    additionalCosts: "0",
    paymentStatus: "unpaid",
    paymentReference: "",
    notes: "",
  });
  const load = useCallback(async () => {
    const [or, dr] = await Promise.all([
      fetch("/api/admin/operations", { cache: "no-store" }),
      fetch("/api/admin/dispatch", { cache: "no-store" }),
    ]);
    const o = await or.json(),
      d = await dr.json();
    if (!or.ok || !dr.ok)
      throw new Error(o.error ?? d.error ?? "Journey unavailable");
    const b = o.bookings.find((x: Booking) => x.reference === reference);
    if (!b) throw new Error("Journey not found");
    const a =
      o.assignments.find(
        (x: Assignment) => x.bookingReference === reference && !x.revokedAt,
      ) ?? null;
    setBooking(b);
    setAssignment(a);
    setDriver(
      a ? (o.drivers.find((x: Driver) => x.id === a.driverId) ?? null) : null,
    );
    setEvents(
      o.events
        .filter((x: Event) => x.bookingReference === reference)
        .sort((a: Event, b: Event) => a.createdAt.localeCompare(b.createdAt)),
    );
    setLatestLocation(o.locations.find((x: JourneyLocation) => x.bookingReference === reference) ?? null);
    setJourneyExceptions(o.exceptions.filter((x: JourneyException) => x.bookingReference === reference));
    const c = d.costs.find((x: Cost) => x.bookingReference === reference);
    setCost({
      agreedDriverCost: String(c?.agreedDriverCost ?? 0),
      additionalCosts: String(c?.additionalCosts ?? 0),
      paymentStatus: c?.paymentStatus ?? "unpaid",
      paymentReference: c?.paymentReference ?? "",
      notes: c?.notes ?? "",
    });
  }, [reference]);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Action failed");
      await load();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  async function review(payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Review failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Review failed");
    } finally {
      setBusy(false);
    }
  }
  const totalCost =
      (Number(cost.agreedDriverCost) || 0) +
      (Number(cost.additionalCosts) || 0),
    margin = (booking?.total ?? 0) - totalCost;
  if (!booking)
    return (
      <main className="min-h-screen bg-[#f3f5f8] p-8 text-[#211726]">
        <p>{error || "Loading journey…"}</p>
      </main>
    );
  return (
    <main className="min-h-screen bg-[#f3f5f8] px-4 py-6 text-[#211726] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin/operations"
          className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold shadow-sm"
        >
          <ArrowLeft size={16} />
          Back to journeys
        </Link>
        {error && (
          <p className="mt-4 rounded-2xl bg-red-50 p-4 font-bold text-red-700">
            {error}
          </p>
        )}
        <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <section className="rounded-[28px] bg-white p-6 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#D96F00]">
              Journey details
            </p>
            <div className="mt-2 flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-black">{booking.reference}</h1>
                <p className="mt-1 text-slate-500">
                  {booking.customerName} · {booking.vehicle}
                </p>
              </div>
              <a
                href={`tel:${booking.customerPhone}`}
                className="grid size-12 place-items-center rounded-full bg-[#211726] text-white"
              >
                <Phone size={20} />
              </a>
            </div>
            <div className="mt-6 rounded-2xl bg-slate-50 p-5">
              <p className="flex gap-3 font-bold">
                <MapPin className="text-[#FF8A05]" />
                {booking.pickup}
              </p>
              <div className="my-2 ml-3 h-5 border-l-2 border-dotted border-slate-300" />
              <p className="flex gap-3 font-bold">
                <Route className="text-[#FF8A05]" />
                {booking.dropoff}
              </p>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Info
                label="Pickup"
                value={`${booking.pickupDate} · ${booking.pickupTime}`}
              />
              <Info label="Customer phone" value={booking.customerPhone} />
              <Info label="Revenue" value={money(booking.total)} />
              <Info label="Status" value={booking.status} />
            </div>
            {assignment && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div>
                  <p className="text-xs font-black uppercase text-emerald-700">
                    Assigned driver
                  </p>
                  <p className="mt-1 font-black">
                    {driver?.fullName} · {driver?.phone}
                  </p>
                  <p className="text-sm text-emerald-800">
                    {labels[assignment.currentStatus] ??
                      assignment.currentStatus}
                  </p>
                </div>
                <button
                  disabled={busy}
                  onClick={async () => {
                    const result = await post({
                      action: "rotate_link",
                      assignmentId: assignment.id,
                    });
                    if (result?.driverUrl)
                      await navigator.clipboard.writeText(result.driverUrl);
                  }}
                  className="flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white"
                >
                  <Clipboard size={16} />
                  Copy link
                </button>
                {assignment.currentStatus === "standby" && !assignment.passengerVerifiedAt && (
                  <button disabled={busy} onClick={() => { const reason = window.prompt("Reason for overriding passenger PIN verification"); if (reason) review({ action: "override_passenger_verification", assignmentId: assignment.id, reason }); }} className="rounded-full border border-amber-300 bg-white px-4 py-2 text-sm font-bold text-amber-800">Override PIN</button>
                )}
                {assignment.passengerVerifiedAt && <span className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">Passenger verified · {assignment.passengerVerificationMethod === "operations_override" ? "Admin override" : "Trip PIN"}</span>}
              </div>
            )}
            {latestLocation && (
              <a href={`https://www.google.com/maps?q=${latestLocation.latitude},${latestLocation.longitude}`} target="_blank" rel="noreferrer" className="mt-4 flex items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                <span><strong className="block">Latest live GPS</strong><span className="text-blue-700">{new Date(latestLocation.serverTimestamp).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })} · ±{latestLocation.accuracyMetres}m · {latestLocation.quality}</span></span>
                <span className="flex items-center gap-2 font-black">Open map <ExternalLink size={15}/></span>
              </a>
            )}
            {journeyExceptions.map((exception) => (
              <div key={exception.id} className={`mt-4 rounded-2xl border p-4 ${exception.status === "open" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                <div className="flex items-center justify-between"><strong>{exception.exceptionType === "abnormal_stop" ? "Abnormal stop" : "Route deviation"}</strong><span className="rounded-full bg-white/70 px-3 py-1 text-xs font-black uppercase">{exception.status}</span></div>
                <p className="mt-2 text-sm">{exception.exceptionType === "abnormal_stop" ? `${Math.round((exception.stopDurationSeconds ?? 0) / 60)} minutes stationary · ${(exception.distanceMetres / 1000).toFixed(1)} km remaining${exception.stopReason ? ` · ${exception.stopReason.replaceAll("_", " ")}` : ""}` : `${(exception.distanceMetres / 1000).toFixed(1)} km from expected route · corridor ${(exception.corridorMetres / 1000).toFixed(1)} km`}</p>
                <p className="mt-1 text-xs opacity-75">Started {new Date(exception.startedAt).toLocaleString("en-GB", { timeZone: "Asia/Bangkok" })} · Last seen {new Date(exception.lastSeenAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok" })}</p>
              </div>
            ))}
            <h2 className="mt-7 text-xl font-black">Driver confirmations</h2>
            <div className="mt-4 space-y-3">
              {events.map((event) => (
                <article
                  key={event.id}
                  className="rounded-2xl border border-slate-200 p-4"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-black">
                        {labels[event.status] ?? event.status}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(event.createdAt).toLocaleString("en-GB", {
                          timeZone: "Asia/Bangkok",
                        })}
                      </p>
                    </div>
                    <span className="h-fit rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
                      {event.verificationStatus.replaceAll("_", " ")}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {event.evidenceKey && (
                      <a
                        target="_blank"
                        href={`/api/admin/evidence/${event.id}`}
                        className="flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold"
                      >
                        <Camera size={14} />
                        View picture
                      </a>
                    )}
                    {event.latitude != null && event.longitude != null && (
                      <a
                        target="_blank"
                        rel="noreferrer"
                        href={`https://www.google.com/maps?q=${event.latitude},${event.longitude}`}
                        className="flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold"
                      >
                        <Navigation size={14} />
                        GPS · ±{event.accuracyMetres ?? "?"}m
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  {event.verificationStatus === "pending_review" && (
                    <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
                      <button
                        disabled={busy}
                        onClick={() =>
                          review({ action: "verify_event", eventId: event.id })
                        }
                        className="flex h-11 items-center justify-center gap-2 rounded-full bg-emerald-600 text-sm font-bold text-white disabled:opacity-50"
                      >
                        <Check size={16} /> Verify drop-off
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => {
                          const reason = window.prompt(
                            "Reason for rejecting this drop-off evidence",
                          );
                          if (reason)
                            review({
                              action: "reject_event",
                              eventId: event.id,
                              reason,
                            });
                        }}
                        className="flex h-11 items-center justify-center gap-2 rounded-full bg-red-50 text-sm font-bold text-red-700 disabled:opacity-50"
                      >
                        <XCircle size={16} /> Reject
                      </button>
                    </div>
                  )}
                </article>
              ))}
              {events.length === 0 && (
                <div className="rounded-2xl border border-dashed p-8 text-center text-slate-500">
                  <Truck className="mx-auto mb-2" />
                  No driver updates yet.
                </div>
              )}
            </div>
          </section>
          <aside className="h-fit rounded-[28px] bg-white p-6 shadow-sm lg:sticky lg:top-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black">Cost & payment</h2>
              <strong
                className={margin < 0 ? "text-red-700" : "text-emerald-700"}
              >
                Margin {money(margin)}
              </strong>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <Field
                label="Agreed cost"
                value={cost.agreedDriverCost}
                onChange={(v) => setCost({ ...cost, agreedDriverCost: v })}
              />
              <Field
                label="Additional costs"
                value={cost.additionalCosts}
                onChange={(v) => setCost({ ...cost, additionalCosts: v })}
              />
              <select
                value={cost.paymentStatus}
                onChange={(e) =>
                  setCost({ ...cost, paymentStatus: e.target.value })
                }
                className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-3"
              >
                <option value="unpaid">Unpaid</option>
                <option value="scheduled">Scheduled</option>
                <option value="paid">Paid</option>
              </select>
              <input
                value={cost.paymentReference}
                onChange={(e) =>
                  setCost({ ...cost, paymentReference: e.target.value })
                }
                placeholder="Payment reference"
                className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-3"
              />
              <textarea
                value={cost.notes}
                onChange={(e) => setCost({ ...cost, notes: e.target.value })}
                placeholder="Internal cost notes"
                className="min-h-24 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:col-span-2 lg:col-span-1 xl:col-span-2"
              />
            </div>
            <div className="mt-4 rounded-2xl bg-orange-50 p-4">
              <div className="flex justify-between">
                <span>Total driver cost</span>
                <strong>{money(totalCost)}</strong>
              </div>
            </div>
            <button
              disabled={busy}
              onClick={() =>
                post({
                  action: "update_cost",
                  bookingReference: reference,
                  agreedDriverCost: Number(cost.agreedDriverCost) || 0,
                  additionalCosts: Number(cost.additionalCosts) || 0,
                  paymentStatus: cost.paymentStatus,
                  paymentReference: cost.paymentReference,
                  notes: cost.notes,
                })
              }
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FF8A05] font-bold text-white"
            >
              <Save size={17} />
              Save cost record
            </button>
          </aside>
        </div>
      </div>
    </main>
  );
}
function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-xs font-bold uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-black">{value}</p>
    </div>
  );
}
function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-xs font-bold text-slate-500">
      {label}
      <input
        required
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base text-slate-900"
      />
    </label>
  );
}
