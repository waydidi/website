"use client";

import {
  BadgeDollarSign,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Clipboard,
  Eye,
  MapPin,
  MapPinned,
  Plus,
  RefreshCw,
  Route,
  Send,
  ShieldCheck,
  Truck,
  UserRound,
  UserRoundPlus,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { DriverCreateForm } from "@/components/driver-create-form";

type Booking = {
  reference: string;
  customerName: string;
  pickup: string;
  dropoff: string;
  pickupDate: string;
  pickupTime: string;
  returnPickup: string | null;
  returnDropoff: string | null;
  returnDate: string | null;
  returnTime: string | null;
  vehicle: string;
  total: number;
  status: string;
};
type Driver = {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  status: string;
  idImageKey?: string | null;
  carImageKey?: string | null;
};
type Cost = {
  bookingReference: string;
  agreedDriverCost: number;
  additionalCosts: number;
  totalDriverCost: number;
  paymentStatus: string;
  paymentReference: string | null;
  notes: string | null;
  paidAt: string | null;
  updatedAt: string;
};
type Assignment = {
  id: string;
  bookingReference: string;
  driverId: string;
  currentStatus: string;
  assignedAt: string;
};
type Data = {
  bookings: Booking[];
  drivers: Driver[];
  costs: Cost[];
  assignments: Assignment[];
};
type CostDraft = {
  agreedDriverCost: string;
  additionalCosts: string;
  paymentStatus: string;
  paymentReference: string;
  notes: string;
};
const money = (value: number) => `฿${value.toLocaleString("en-US")}`;

export default function DispatchWorkspace({ email }: { email: string }) {
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [selected, setSelected] = useState(""),
    [query, setQuery] = useState("");
  const [driverId, setDriverId] = useState(""),
    [driverCost, setDriverCost] = useState(""),
    [latestLink, setLatestLink] = useState("");
  const [showDriverForm, setShowDriverForm] = useState(false);
  const [draft, setDraft] = useState<CostDraft>({
    agreedDriverCost: "0",
    additionalCosts: "0",
    paymentStatus: "unpaid",
    paymentReference: "",
    notes: "",
  });
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/dispatch", {
        cache: "no-store",
      });
      const result = (await response.json()) as Data & { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? "Dispatch data unavailable.");
      setData(result);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Dispatch data unavailable.",
      );
    }
  }, []);
  useEffect(() => {
    void Promise.resolve().then(load);
    const timer = window.setInterval(load, 20_000);
    return () => window.clearInterval(timer);
  }, [load]);
  const costs = useMemo(
      () =>
        new Map(
          (data?.costs ?? []).map((item) => [item.bookingReference, item]),
        ),
      [data],
    ),
    assignments = useMemo(
      () =>
        new Map(
          (data?.assignments ?? []).map((item) => [
            item.bookingReference,
            item,
          ]),
        ),
      [data],
    ),
    drivers = useMemo(
      () => new Map((data?.drivers ?? []).map((item) => [item.id, item])),
      [data],
    );
  const selectedBooking = data?.bookings.find(
      (item) => item.reference === selected,
    ),
    selectedCost = selectedBooking
      ? costs.get(selectedBooking.reference)
      : undefined,
    assignment = selectedBooking
      ? assignments.get(selectedBooking.reference)
      : undefined;
  useEffect(() => {
    queueMicrotask(() => {
      setDraft({
        agreedDriverCost: String(selectedCost?.agreedDriverCost ?? 0),
        additionalCosts: String(selectedCost?.additionalCosts ?? 0),
        paymentStatus: selectedCost?.paymentStatus ?? "unpaid",
        paymentReference: selectedCost?.paymentReference ?? "",
        notes: selectedCost?.notes ?? "",
      });
      setDriverCost(String(selectedCost?.agreedDriverCost || ""));
      setLatestLink("");
    });
  }, [selected, selectedCost]);
  const rows = (data?.bookings ?? []).filter((item) =>
      `${item.reference} ${item.customerName} ${item.pickup} ${item.dropoff}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
    totalRevenue = (data?.bookings ?? []).reduce(
      (sum, item) => sum + item.total,
      0,
    ),
    totalCost = (data?.costs ?? []).reduce(
      (sum, item) => sum + item.totalDriverCost,
      0,
    );
  const metrics = [
    {
      label: "Unassigned bookings",
      value: String(
        (data?.bookings ?? []).filter(
          (item) =>
            !assignments.has(item.reference) && item.status === "confirmed",
        ).length,
      ),
      icon: UserRoundPlus,
    },
    {
      label: "Assigned jobs",
      value: String((data?.assignments ?? []).length),
      icon: UserRound,
    },
    {
      label: "Unpaid driver costs",
      value: money(
        (data?.costs ?? [])
          .filter((item) => item.paymentStatus !== "paid")
          .reduce((sum, item) => sum + item.totalDriverCost, 0),
      ),
      icon: WalletCards,
    },
    {
      label: "Projected gross margin",
      value: money(totalRevenue - totalCost),
      icon: BadgeDollarSign,
    },
  ];
  async function action(payload: Record<string, unknown>) {
    setBusy(String(payload.action));
    setError("");
    try {
      const response = await fetch("/api/admin/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: string;
        driverUrl?: string;
        driver?: Driver;
      };
      if (!response.ok) throw new Error(result.error ?? "Action failed.");
      if (result.driverUrl) setLatestLink(result.driverUrl);
      if (result.driver) setDriverId(result.driver.id);
      await load();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
      return null;
    } finally {
      setBusy("");
    }
  }
  async function copyDriverLink(assignmentId: string) {
    const result = await action({ action: "rotate_link", assignmentId });
    if (result?.driverUrl)
      await navigator.clipboard.writeText(result.driverUrl);
  }
  const agreed = Number(draft.agreedDriverCost) || 0,
    additional = Number(draft.additionalCosts) || 0;

  return (
    <main className="min-h-screen bg-[#f3f5f8] text-[#211726]">
      <header className="bg-[#FF8A05] px-5 py-5 text-white sm:px-8">
        <div className="mx-auto flex max-w-[1550px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <Link href="/" className="inline-flex">
              <WaydidiLogo className="h-12 w-auto" />
            </Link>
            <span className="hidden h-8 w-px bg-white/30 sm:block" />
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-white/75">
                Waydidi operations
              </p>
              <h1 className="text-2xl font-black">Driver dispatch & costs</h1>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-bold">
            <ShieldCheck size={17} />
            {email}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-[1550px] px-4 py-6 sm:px-8">
        <nav className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 text-sm font-bold shadow-sm">
          <Link
            href="/admin/calendar"
            className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-slate-600"
          >
            <CalendarDays size={17} />
            Calendar
          </Link>
          <Link
            href="/admin/bookings"
            className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-slate-600"
          >
            <BookOpen size={17} />
            Bookings
          </Link>
          <Link
            href="/admin/dispatch"
            className="flex shrink-0 items-center gap-2 rounded-xl bg-orange-50 px-4 py-3 text-[#D96F00]"
          >
            <Send size={17} />
            Driver dispatch
          </Link>
          <Link
            href="/admin/operations"
            className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-slate-600"
          >
            <Truck size={17} />
            Booking operations
          </Link>
          <Link
            href="/admin/pricing"
            className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-slate-600"
          >
            <MapPinned size={17} />
            Pricing areas
          </Link>
        </nav>
        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(({ label, value, icon: Icon }) => (
            <article
              key={label}
              className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-500">{label}</p>
                  <p className="mt-3 text-3xl font-black">{value}</p>
                </div>
                <span className="grid size-11 place-items-center rounded-2xl bg-orange-50 text-[#D96F00]">
                  <Icon size={21} />
                </span>
              </div>
            </article>
          ))}
        </section>
        {error && (
          <p className="mt-5 rounded-2xl bg-red-50 p-4 font-semibold text-red-700">
            {error}
          </p>
        )}
        {latestLink && (
          <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <CheckCircle2 size={19} />
            <strong>Secure driver trip link ready</strong>
            <button
              onClick={() => navigator.clipboard.writeText(latestLink)}
              className="ml-auto flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white"
            >
              <Clipboard size={15} />
              Copy driver link
            </button>
          </div>
        )}
        <section
          className={`mt-5 grid gap-5 ${selectedBooking ? "xl:grid-cols-[1fr_440px]" : "grid-cols-1"}`}
        >
          <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
              <div>
                <h2 className="text-xl font-black">Booking dispatch board</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Admin assigns every driver and confirms the agreed cost.
                </p>
              </div>
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search booking"
                  className="h-11 rounded-full border border-slate-200 bg-slate-50 px-4 outline-none focus:border-orange-400"
                />
                <button
                  onClick={load}
                  className="grid size-11 place-items-center rounded-full border border-slate-200"
                  aria-label="Refresh"
                >
                  <RefreshCw size={17} />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[950px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-4">Journey</th>
                    <th className="px-5 py-4">Pickup</th>
                    <th className="px-5 py-4">Revenue</th>
                    <th className="px-5 py-4">Driver</th>
                    <th className="px-5 py-4">Cost</th>
                    <th className="px-5 py-4">Margin</th>
                    <th className="px-5 py-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((booking) => {
                    const cost = costs.get(booking.reference),
                      assigned = assignments.get(booking.reference);
                    return (
                      <tr
                        key={booking.reference}
                        className={`hover:bg-orange-50/50 ${selected === booking.reference ? "bg-orange-50/70" : ""}`}
                      >
                        <td className="px-5 py-4">
                          <strong>{booking.reference}</strong>
                          <p className="mt-1 max-w-[260px] text-slate-500">
                            {booking.pickup} → {booking.dropoff}
                          </p>
                          {booking.returnDate && (
                            <p className="mt-1 max-w-[260px] text-xs font-bold text-[#B85E00]">
                              Return: {booking.returnPickup ?? booking.dropoff} → {booking.returnDropoff ?? booking.pickup}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-4 font-bold">
                          {booking.pickupDate}
                          <p className="text-slate-500">{booking.pickupTime}</p>
                          {booking.returnDate && booking.returnTime && (
                            <p className="mt-1 text-xs text-[#B85E00]">Return {booking.returnDate} · {booking.returnTime}</p>
                          )}
                        </td>
                        <td className="px-5 py-4 font-black">
                          {money(booking.total)}
                        </td>
                        <td className="px-5 py-4">
                          {assigned ? (
                            <>
                              <strong>
                                {drivers.get(assigned.driverId)?.fullName ??
                                  "Assigned"}
                              </strong>
                              <p className="text-xs text-emerald-700">
                                Assigned by admin
                              </p>
                            </>
                          ) : (
                            <span className="font-bold text-amber-700">
                              Unassigned
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 font-bold">
                          {money(cost?.totalDriverCost ?? 0)}
                          <p className="text-xs text-slate-500">
                            {cost?.paymentStatus ?? "unpaid"}
                          </p>
                        </td>
                        <td
                          className={`px-5 py-4 font-black ${booking.total - (cost?.totalDriverCost ?? 0) < 0 ? "text-red-700" : "text-emerald-700"}`}
                        >
                          {money(booking.total - (cost?.totalDriverCost ?? 0))}
                        </td>
                        <td className="px-5 py-4">
                        <Link
                          href={`/admin/journeys/${encodeURIComponent(booking.reference)}`}
                          aria-label={`View ${booking.reference}`}
                          className="grid size-10 place-items-center rounded-full border border-orange-200 text-[#D96F00] hover:bg-orange-50"
                        >
                          <Eye size={17} />
                        </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          {selectedBooking && (
            <aside className="h-fit rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[.14em] text-[#D96F00]">
                    Dispatch job
                  </p>
                  <h2 className="mt-2 text-2xl font-black">
                    {selectedBooking.reference}
                  </h2>
                </div>
                <button
                  onClick={() => setSelected("")}
                  className="grid size-9 place-items-center rounded-full border border-slate-200 text-slate-500"
                  aria-label="Hide details"
                >
                  <X size={17} />
                </button>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {selectedBooking.customerName} · {selectedBooking.vehicle}
              </p>
              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm">
                <p className="flex gap-2 font-bold">
                  <MapPin size={17} className="shrink-0 text-orange-500" />
                  {selectedBooking.pickup}
                </p>
                <p className="my-2 ml-2 h-4 border-l-2 border-dotted border-slate-300" />
                <p className="flex gap-2 font-bold">
                  <Route size={17} className="shrink-0 text-orange-500" />
                  {selectedBooking.dropoff}
                </p>
              </div>
              {assignment ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                    Assigned driver
                  </p>
                  <p className="mt-1 font-black">
                    {drivers.get(assignment.driverId)?.fullName}
                  </p>
                  <p className="mt-1 text-sm text-emerald-800">
                    {drivers.get(assignment.driverId)?.phone}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={Boolean(busy)}
                      onClick={() => copyDriverLink(assignment.id)}
                      className="flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
                    >
                      <Clipboard size={14} />
                      Copy link
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-5">
                  <div className="flex items-center justify-between">
                    <h3 className="font-black">Assign driver directly</h3>
                    <button
                      onClick={() => setShowDriverForm((value) => !value)}
                      className="flex items-center gap-1 text-sm font-bold text-[#D96F00]"
                    >
                      <Plus size={15} />
                      New driver
                    </button>
                  </div>
                  {showDriverForm && (
                    <div className="mt-3 rounded-2xl bg-orange-50 p-3">
                      <DriverCreateForm
                        darkButton
                        onCreated={async (driver) => {
                          setDriverId(driver.id);
                          setShowDriverForm(false);
                          await load();
                        }}
                      />
                    </div>
                  )}
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <select
                      value={driverId}
                      onChange={(event) => setDriverId(event.target.value)}
                      className="col-span-2 h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                    >
                      <option value="">Choose active driver</option>
                      {data?.drivers
                        .filter((item) => item.status === "active")
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.fullName} · {item.phone}
                          </option>
                        ))}
                    </select>
                    <label className="col-span-2 text-xs font-bold text-slate-500">
                      Agreed driver cost
                      <input
                        inputMode="numeric"
                        value={driverCost}
                        onChange={(event) => setDriverCost(event.target.value)}
                        placeholder="THB"
                        className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base text-slate-900"
                      />
                    </label>
                  </div>
                  <button
                    disabled={!driverId || driverCost === "" || Boolean(busy)}
                    onClick={() =>
                      action({
                        action: "assign_driver",
                        bookingReference: selectedBooking.reference,
                        driverId,
                        agreedDriverCost: Number(driverCost),
                      })
                    }
                    className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#FF8A05] font-bold text-white disabled:opacity-40"
                  >
                    <Send size={16} />
                    Assign driver & create trip link
                  </button>
                </div>
              )}
              <div className="mt-6 border-t border-slate-100 pt-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-black">Cost & payment</h3>
                  <span className="text-sm font-black text-emerald-700">
                    Margin {money(selectedBooking.total - agreed - additional)}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <label className="text-xs font-bold text-slate-500">
                    Agreed cost
                    <input
                      inputMode="numeric"
                      value={draft.agreedDriverCost}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          agreedDriverCost: event.target.value,
                        })
                      }
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base text-slate-900"
                    />
                  </label>
                  <label className="text-xs font-bold text-slate-500">
                    Additional costs
                    <input
                      inputMode="numeric"
                      value={draft.additionalCosts}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          additionalCosts: event.target.value,
                        })
                      }
                      className="mt-1 h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-base text-slate-900"
                    />
                  </label>
                  <select
                    value={draft.paymentStatus}
                    onChange={(event) =>
                      setDraft({ ...draft, paymentStatus: event.target.value })
                    }
                    className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  >
                    <option value="unpaid">Unpaid</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="paid">Paid</option>
                  </select>
                  <input
                    value={draft.paymentReference}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        paymentReference: event.target.value,
                      })
                    }
                    placeholder="Payment reference"
                    className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3"
                  />
                  <textarea
                    value={draft.notes}
                    onChange={(event) =>
                      setDraft({ ...draft, notes: event.target.value })
                    }
                    placeholder="Internal cost notes"
                    className="col-span-2 min-h-20 rounded-xl border border-slate-200 bg-slate-50 p-3"
                  />
                </div>
                <button
                  disabled={Boolean(busy)}
                  onClick={() =>
                    action({
                      action: "update_cost",
                      bookingReference: selectedBooking.reference,
                      agreedDriverCost: agreed,
                      additionalCosts: additional,
                      paymentStatus: draft.paymentStatus,
                      paymentReference: draft.paymentReference,
                      notes: draft.notes,
                    })
                  }
                  className="mt-3 h-11 w-full rounded-full bg-[#211726] font-bold text-white"
                >
                  Save cost record
                </button>
              </div>
            </aside>
          )}
        </section>
      </div>
    </main>
  );
}
