"use client";

import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Copy,
  ExternalLink,
  Filter,
  Flag,
  LoaderCircle,
  MapPin,
  MapPinned,
  Navigation,
  Phone,
  Plus,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Truck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { WaydidiLogo } from "@/components/waydidi-logo";

type ViewMode = "today" | "three" | "week" | "month";
type Attention = { level: "normal" | "warning" | "critical" | "cancelled"; reason: string | null };
type Driver = { id: string; fullName: string; phone: string; email: string | null; remindersEnabled: boolean; status: string };
type Assignment = { id: string; driverId: string; currentStatus: string; assignedAt: string; tokenExpiresAt: string };
type Booking = {
  reference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  pickup: string;
  dropoff: string;
  pickupDate: string;
  pickupTime: string;
  passengers: number;
  luggage: number;
  flightNumber: string | null;
  vehicle: string;
  total: number;
  paymentMethod: string;
  status: string;
  emailStatus: string;
  pricingArea: string | null;
  routeDistanceMeters: number | null;
  routeDurationSeconds: number | null;
  preparationBufferMinutes: number;
  postTripBufferMinutes: number;
  attentionStatus: string;
  attentionReason: string | null;
  internalNotes: string | null;
  operationalStartsAt: string;
  operationalEndsAt: string;
  durationEstimated: boolean;
  assignment: Assignment | null;
  pendingEvidence: number;
  conflicts: string[];
  attention: Attention;
};
type Availability = { id: string; driverId: string; startsAt: string; endsAt: string; reason: string | null };
type CalendarEvent = { id: string; title: string; startsAt: string; endsAt: string; driverId: string | null; notes: string | null };
type OperationsAlert = { id: string; bookingReference: string; alertType: string; severity: string; title: string; details: string | null; status: string; detectedAt: string; acknowledgedBy: string | null };
type Notification = { id: string; bookingReference: string; notificationType: string; recipient: string; status: string; sentAt: string | null; errorMessage: string | null };
type CalendarData = { timezone: string; bookings: Booking[]; drivers: Driver[]; availability: Availability[]; calendarEvents: CalendarEvent[]; alerts: OperationsAlert[]; notifications: Notification[]; refreshedAt: string };

const DAY_MS = 86_400_000;
const statusNames: Record<string, string> = {
  assigned: "Assigned",
  going_to_standby: "Going to standby",
  standby: "Standing by",
  passenger_picked_up: "Passenger picked up",
  completed: "Completed",
};
const cardStyles: Record<Attention["level"], string> = {
  normal: "border-slate-200 bg-white hover:border-orange-300",
  warning: "border-amber-300 bg-amber-50 hover:border-amber-400",
  critical: "border-red-300 bg-red-50 hover:border-red-400",
  cancelled: "border-slate-200 bg-slate-100 opacity-65",
};

function dateFromParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function todayInBangkok() {
  return dateFromParts(new Date());
}

function addDays(value: string, amount: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function firstOfMonth(value: string) {
  return `${value.slice(0, 7)}-01`;
}

function lastOfMonth(value: string) {
  const date = new Date(`${firstOfMonth(value)}T12:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.toISOString().slice(0, 10);
}

function weekStart(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(value, -offset);
}

function rangeFor(anchor: string, view: ViewMode) {
  if (view === "today") return { from: anchor, to: anchor };
  if (view === "three") return { from: anchor, to: addDays(anchor, 2) };
  if (view === "week") {
    const from = weekStart(anchor);
    return { from, to: addDays(from, 6) };
  }
  const monthStart = firstOfMonth(anchor);
  const from = weekStart(monthStart);
  const monthEnd = lastOfMonth(anchor);
  const to = addDays(monthEnd, 6 - ((new Date(`${monthEnd}T12:00:00Z`).getUTCDay() + 6) % 7));
  return { from, to };
}

function formatDate(value: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", ...options }).format(new Date(`${value}T12:00:00Z`));
}

function formatInstant(value: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function instantDate(value: string) {
  return dateFromParts(new Date(value));
}

function dateList(from: string, to: string) {
  const dates: string[] = [];
  for (let value = from; value <= to; value = addDays(value, 1)) dates.push(value);
  return dates;
}

function rangeLabel(anchor: string, view: ViewMode, from: string, to: string) {
  if (view === "month") return formatDate(anchor, { month: "long", year: "numeric" });
  if (from === to) return formatDate(from, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return `${formatDate(from, { day: "numeric", month: "short" })} – ${formatDate(to, { day: "numeric", month: "short", year: "numeric" })}`;
}

function navigateDate(anchor: string, view: ViewMode, direction: number) {
  if (view === "month") {
    const date = new Date(`${firstOfMonth(anchor)}T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + direction);
    return date.toISOString().slice(0, 10);
  }
  return addDays(anchor, direction * (view === "week" ? 7 : view === "three" ? 3 : 1));
}

function thaiIso(value: string) {
  return new Date(`${value}:00+07:00`).toISOString();
}

export default function CalendarWorkspace({ email }: { email: string }) {
  const [anchor, setAnchor] = useState(todayInBangkok);
  const [view, setView] = useState<ViewMode>("today");
  const [data, setData] = useState<CalendarData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [driverFilter, setDriverFilter] = useState("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [blockType, setBlockType] = useState<"unavailable" | "event">("unavailable");
  const [blockDriver, setBlockDriver] = useState("");
  const [blockTitle, setBlockTitle] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockStart, setBlockStart] = useState(`${anchor}T09:00`);
  const [blockEnd, setBlockEnd] = useState(`${anchor}T17:00`);
  const [selectedDriver, setSelectedDriver] = useState("");
  const [latestLink, setLatestLink] = useState("");
  const range = useMemo(() => rangeFor(anchor, view), [anchor, view]);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch(`/api/admin/calendar?from=${range.from}&to=${range.to}`, { cache: "no-store" });
      const result = await response.json() as CalendarData & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Calendar unavailable.");
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Calendar unavailable.");
    }
  }, [range.from, range.to]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    setBlockStart(`${anchor}T09:00`);
    setBlockEnd(`${anchor}T17:00`);
  }, [anchor]);

  const filteredBookings = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data?.bookings ?? []).filter((booking) => {
      if (driverFilter !== "all" && booking.assignment?.driverId !== driverFilter) return false;
      if (filter === "attention" && booking.attention.level === "normal") return false;
      if (filter === "unassigned" && booking.assignment) return false;
      if (filter === "active" && ["completed", "cancelled"].includes(booking.status)) return false;
      if (filter === "completed" && booking.status !== "completed") return false;
      if (needle && ![booking.reference, booking.customerName, booking.customerPhone, booking.pickup, booking.dropoff, booking.vehicle].join(" ").toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [data, driverFilter, filter, query]);

  const stats = useMemo(() => {
    const rows = data?.bookings ?? [];
    return {
      total: rows.length,
      unassigned: rows.filter((row) => row.status === "confirmed" && !row.assignment).length,
      attention: rows.filter((row) => ["critical", "warning"].includes(row.attention.level)).length,
      inProgress: rows.filter((row) => row.assignment && ["going_to_standby", "standby", "passenger_picked_up"].includes(row.assignment.currentStatus)).length,
      completed: rows.filter((row) => row.status === "completed").length,
    };
  }, [data]);

  const selectedBooking = data?.bookings.find((booking) => booking.reference === selected) ?? null;
  const selectedAssignmentDriver = data?.drivers.find((driver) => driver.id === selectedBooking?.assignment?.driverId);

  async function calendarAction(payload: Record<string, unknown>, success: string, allowOverride = false) {
    setBusy(String(payload.action ?? "action"));
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/calendar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; conflicts?: string[]; canOverride?: boolean; driverUrl?: string };
      if (!response.ok) {
        if (allowOverride && result.canOverride && result.conflicts?.length && window.confirm(`${result.error}\n\n${result.conflicts.join("\n")}\n\nAssign anyway?`)) {
          return calendarAction({ ...payload, overrideConflict: true }, success, false);
        }
        throw new Error(result.conflicts?.length ? `${result.error} ${result.conflicts.join("; ")}` : result.error ?? "Action failed.");
      }
      if (result.driverUrl) setLatestLink(result.driverUrl);
      setMessage(success);
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Action failed.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function automationAction(payload: Record<string, unknown>, success: string) {
    setBusy(String(payload.action ?? "automation"));
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/automation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; summary?: { notificationsSent: number; alertsOpened: number; alertsResolved: number } };
      if (!response.ok) throw new Error(result.error ?? "Automation action failed.");
      setMessage(result.summary ? `${success} ${result.summary.notificationsSent} reminders sent, ${result.summary.alertsOpened} alerts opened, ${result.summary.alertsResolved} resolved.` : success);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Automation action failed.");
    } finally {
      setBusy("");
    }
  }

  async function saveBlock(event: FormEvent) {
    event.preventDefault();
    const payload = blockType === "unavailable"
      ? { action: "create_availability", driverId: blockDriver, startsAt: thaiIso(blockStart), endsAt: thaiIso(blockEnd), reason: blockReason }
      : { action: "create_event", title: blockTitle, driverId: blockDriver || undefined, startsAt: thaiIso(blockStart), endsAt: thaiIso(blockEnd), notes: blockReason };
    if (await calendarAction(payload, blockType === "unavailable" ? "Driver unavailability added." : "Calendar event added.")) {
      setDialogOpen(false);
      setBlockTitle("");
      setBlockReason("");
    }
  }

  return (
    <main className="min-h-screen bg-[#f3f5f8] text-[#211726]">
      <header className="border-b border-orange-400 bg-[#FF8A05] px-4 py-4 text-white sm:px-8">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <a href="/" aria-label="Waydidi home"><WaydidiLogo className="h-12 w-auto" /></a>
            <span className="hidden h-8 w-px bg-white/30 sm:block" />
            <div><p className="text-xs font-bold uppercase tracking-[.14em] text-white/70">Waydidi operations</p><h1 className="text-xl font-black sm:text-2xl">Operations calendar</h1></div>
          </div>
          <span className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-bold"><ShieldCheck size={17} />{email}</span>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] px-4 py-5 sm:px-8">
        <nav className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1 text-sm font-bold shadow-sm sm:w-fit">
          <a href="/admin/calendar" className="flex shrink-0 items-center gap-2 rounded-xl bg-orange-50 px-4 py-3 text-[#D96F00]"><CalendarDays size={17} />Calendar</a>
          <a href="/admin/operations" className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-slate-600"><Truck size={17} />Booking operations</a>
          <a href="/admin/bookings" className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-slate-600"><BookOpen size={17} />Bookings</a>
          <a href="/admin/pricing" className="flex shrink-0 items-center gap-2 rounded-xl px-4 py-3 text-slate-600"><MapPinned size={17} />Pricing areas</a>
        </nav>

        <section className="mt-5 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button onClick={() => setAnchor(navigateDate(anchor, view, -1))} className="grid size-11 place-items-center rounded-full border border-slate-200" aria-label="Previous period"><ChevronLeft size={20} /></button>
              <button onClick={() => setAnchor(todayInBangkok())} className="h-11 rounded-full border border-slate-200 px-4 text-sm font-bold">Today</button>
              <button onClick={() => setAnchor(navigateDate(anchor, view, 1))} className="grid size-11 place-items-center rounded-full border border-slate-200" aria-label="Next period"><ChevronRight size={20} /></button>
              <input type="date" value={anchor} onChange={(event) => setAnchor(event.target.value)} className="hidden h-11 rounded-xl border border-slate-200 px-3 sm:block" aria-label="Calendar date" />
            </div>
            <h2 className="order-first w-full text-xl font-black tracking-[-.02em] sm:order-none sm:w-auto sm:text-2xl">{rangeLabel(anchor, view, range.from, range.to)}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-xl bg-slate-100 p-1 text-sm font-bold">{(["today", "three", "week", "month"] as ViewMode[]).map((mode) => <button key={mode} onClick={() => setView(mode)} className={`rounded-lg px-3 py-2 capitalize ${view === mode ? "bg-white text-[#D96F00] shadow-sm" : "text-slate-500"}`}>{mode === "three" ? "3 days" : mode}</button>)}</div>
              <button onClick={() => setDialogOpen(true)} className="flex h-11 items-center gap-2 rounded-full bg-[#211726] px-4 text-sm font-bold text-white"><Plus size={17} />Add block</button>
              <button disabled={Boolean(busy)} onClick={() => automationAction({ action: "run_now" }, "Operations scan complete.")} className="flex h-11 items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-4 text-sm font-bold text-[#D96F00] disabled:opacity-50"><RefreshCw className={busy === "run_now" ? "animate-spin" : ""} size={17} />Run alerts</button>
              <button onClick={load} className="grid size-11 place-items-center rounded-full border border-slate-200" aria-label="Refresh calendar"><RefreshCw size={18} /></button>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Summary label="Journeys" value={stats.total} icon={<CalendarDays size={19} />} />
            <Summary label="Unassigned" value={stats.unassigned} icon={<UserRound size={19} />} tone={stats.unassigned ? "critical" : "normal"} />
            <Summary label="Needs attention" value={stats.attention} icon={<AlertTriangle size={19} />} tone={stats.attention ? "warning" : "normal"} />
            <Summary label="In progress" value={stats.inProgress} icon={<Navigation size={19} />} />
            <Summary label="Completed" value={stats.completed} icon={<CheckCircle2 size={19} />} />
          </div>

          <div className="mt-5 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
            <label className="relative min-w-[240px] flex-1"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Reference, customer, phone or location" className="h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 pl-11 pr-4 outline-none focus:border-[#FF8A05]" /></label>
            <label className="relative"><Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><select value={filter} onChange={(event) => setFilter(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-bold"><option value="all">All bookings</option><option value="attention">Needs attention</option><option value="unassigned">Unassigned</option><option value="active">Active</option><option value="completed">Completed</option></select></label>
            <select value={driverFilter} onChange={(event) => setDriverFilter(event.target.value)} className="h-12 rounded-2xl border border-slate-200 bg-white px-4 text-sm font-bold"><option value="all">All drivers</option>{data?.drivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName}</option>)}</select>
          </div>
        </section>

        {latestLink && <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 size={19} /><strong>Driver link generated. Copy it now; it is not shown again.</strong><button onClick={() => navigator.clipboard.writeText(latestLink)} className="ml-auto flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2 font-bold text-white"><Copy size={15} />Copy link</button></div>}
        {message && <p className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">{message}</p>}
        {error && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-700">{error}</p>}

        {data && data.alerts.some((alert) => alert.status !== "resolved") && <section className="mt-4 rounded-[24px] border border-red-200 bg-white p-4 shadow-sm"><div className="mb-3 flex items-center gap-2"><AlertTriangle className="text-red-600" size={20} /><h2 className="font-black">Journey alerts</h2><span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-black text-red-700">{data.alerts.filter((alert) => alert.status !== "resolved").length}</span></div><div className="grid gap-3 lg:grid-cols-2">{data.alerts.filter((alert) => alert.status !== "resolved").map((alert) => <article key={alert.id} className={`rounded-2xl border p-4 ${alert.severity === "critical" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}><button onClick={() => setSelected(alert.bookingReference)} className="w-full text-left"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wider text-slate-500">{alert.bookingReference} · {formatInstant(alert.detectedAt)}</p><h3 className="mt-1 font-black">{alert.title}</h3></div><span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold capitalize">{alert.status}</span></div>{alert.details && <p className="mt-2 text-sm text-slate-600">{alert.details}</p>}</button><div className="mt-3 flex gap-2">{alert.status === "open" && <button disabled={Boolean(busy)} onClick={() => automationAction({ action: "acknowledge_alert", alertId: alert.id }, "Alert acknowledged.")} className="rounded-full border border-slate-300 bg-white px-3 py-2 text-xs font-bold">Acknowledge</button>}<button disabled={Boolean(busy)} onClick={() => automationAction({ action: "resolve_alert", alertId: alert.id }, "Alert resolved.")} className="rounded-full bg-[#211726] px-3 py-2 text-xs font-bold text-white">Resolve</button></div></article>)}</div></section>}

        <section className="mt-5">
          {!data ? <div className="grid min-h-80 place-items-center rounded-[28px] bg-white"><LoaderCircle className="animate-spin text-[#FF8A05]" size={30} /></div> : view === "month" ? (
            <MonthGrid dates={dateList(range.from, range.to)} anchor={anchor} bookings={filteredBookings} events={data.calendarEvents} onSelect={setSelected} />
          ) : (
            <AgendaGrid dates={dateList(range.from, range.to)} bookings={filteredBookings} events={data.calendarEvents} availability={data.availability} drivers={data.drivers} onSelect={setSelected} />
          )}
        </section>
      </div>

      <Sheet open={Boolean(selectedBooking)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto bg-white sm:max-w-xl">
          {selectedBooking && <BookingPanel key={selectedBooking.reference} booking={selectedBooking} driver={selectedAssignmentDriver} drivers={data?.drivers ?? []} alerts={data?.alerts.filter((alert) => alert.bookingReference === selectedBooking.reference) ?? []} notifications={data?.notifications.filter((notification) => notification.bookingReference === selectedBooking.reference) ?? []} selectedDriver={selectedDriver} setSelectedDriver={setSelectedDriver} busy={busy} onSave={(updates) => calendarAction({ action: "update_booking", bookingReference: selectedBooking.reference, ...updates }, "Booking operations updated.")} onAssign={() => calendarAction({ action: "assign_driver", bookingReference: selectedBooking.reference, driverId: selectedDriver }, "Driver assigned.", true)} />}
        </SheetContent>
      </Sheet>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-[26px] bg-white sm:max-w-xl">
          <DialogHeader><DialogTitle className="text-2xl font-black">Add calendar block</DialogTitle><DialogDescription>Record driver unavailability or an internal operations event.</DialogDescription></DialogHeader>
          <form onSubmit={saveBlock} className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">{(["unavailable", "event"] as const).map((type) => <button type="button" key={type} onClick={() => setBlockType(type)} className={`rounded-lg px-3 py-2 text-sm font-bold ${blockType === type ? "bg-white text-[#D96F00] shadow-sm" : "text-slate-500"}`}>{type === "unavailable" ? "Driver unavailable" : "Operations event"}</button>)}</div>
            {blockType === "event" && <Field label="Title"><input required value={blockTitle} onChange={(event) => setBlockTitle(event.target.value)} maxLength={120} className="field" placeholder="Vehicle maintenance or private booking" /></Field>}
            <Field label={blockType === "unavailable" ? "Driver" : "Driver (optional)"}><select required={blockType === "unavailable"} value={blockDriver} onChange={(event) => setBlockDriver(event.target.value)} className="field"><option value="">{blockType === "unavailable" ? "Choose driver" : "No driver"}</option>{data?.drivers.filter((driver) => driver.status === "active").map((driver) => <option key={driver.id} value={driver.id}>{driver.fullName}</option>)}</select></Field>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Starts"><input required type="datetime-local" value={blockStart} onChange={(event) => setBlockStart(event.target.value)} className="field" /></Field><Field label="Ends"><input required type="datetime-local" value={blockEnd} onChange={(event) => setBlockEnd(event.target.value)} className="field" /></Field></div>
            <Field label="Reason or notes"><textarea value={blockReason} onChange={(event) => setBlockReason(event.target.value)} rows={3} maxLength={1000} className="field resize-none" placeholder="Optional internal details" /></Field>
            <button disabled={Boolean(busy)} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FF8A05] font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={18} /> : <Plus size={18} />}Add to calendar</button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Summary({ label, value, icon, tone = "normal" }: { label: string; value: number; icon: React.ReactNode; tone?: "normal" | "warning" | "critical" }) {
  const style = tone === "critical" ? "bg-red-50 text-red-700" : tone === "warning" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-700";
  return <div className={`rounded-2xl p-4 ${style}`}><div className="flex items-center justify-between"><span className="text-sm font-bold">{label}</span>{icon}</div><p className="mt-2 text-3xl font-black">{value}</p></div>;
}

function JourneyCard({ booking, onSelect, compact = false }: { booking: Booking; onSelect: (reference: string) => void; compact?: boolean }) {
  return <button onClick={() => onSelect(booking.reference)} className={`w-full rounded-2xl border p-3 text-left transition ${cardStyles[booking.attention.level]}`}>
    <div className="flex items-start justify-between gap-2"><span className="text-lg font-black">{booking.pickupTime}</span><span className="text-xs font-bold text-slate-500">{booking.reference}</span></div>
    <p className="mt-2 line-clamp-1 text-sm font-black">{booking.pickup}</p>
    {!compact && <p className="mt-1 line-clamp-1 text-xs text-slate-500">→ {booking.dropoff}</p>}
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold"><span className="rounded-full bg-slate-100 px-2.5 py-1">{booking.assignment ? statusNames[booking.assignment.currentStatus] ?? booking.assignment.currentStatus : "Unassigned"}</span>{booking.attention.reason && <span className={booking.attention.level === "critical" ? "text-red-700" : "text-amber-700"}>{booking.attention.reason}</span>}</div>
  </button>;
}

function AgendaGrid({ dates, bookings, events, availability, drivers, onSelect }: { dates: string[]; bookings: Booking[]; events: CalendarEvent[]; availability: Availability[]; drivers: Driver[]; onSelect: (reference: string) => void }) {
  return <div className={`grid gap-4 ${dates.length === 1 ? "grid-cols-1" : dates.length === 3 ? "lg:grid-cols-3" : "xl:grid-cols-7"}`}>{dates.map((date) => {
    const rows = bookings.filter((booking) => booking.pickupDate === date);
    const notes = events.filter((event) => instantDate(event.startsAt) === date);
    const unavailable = availability.filter((item) => instantDate(item.startsAt) === date);
    return <section key={date} className="min-h-52 rounded-[24px] border border-slate-200 bg-white p-3 shadow-sm"><header className={`mb-3 rounded-2xl p-3 ${date === todayInBangkok() ? "bg-[#FF8A05] text-white" : "bg-slate-100"}`}><p className="text-xs font-bold uppercase tracking-wider">{formatDate(date, { weekday: "short" })}</p><p className="mt-1 text-xl font-black">{formatDate(date, { day: "numeric", month: "short" })}</p></header><div className="space-y-2">{notes.map((event) => <div key={event.id} className="rounded-xl bg-[#211726] p-3 text-xs font-bold text-white"><Clock3 className="mb-2" size={15} />{event.title}<p className="mt-1 font-normal text-white/70">{formatInstant(event.startsAt)}</p></div>)}{unavailable.map((item) => <div key={item.id} className="rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-600"><strong>{drivers.find((driver) => driver.id === item.driverId)?.fullName ?? "Driver"} unavailable</strong>{item.reason && <p className="mt-1">{item.reason}</p>}</div>)}{rows.map((booking) => <JourneyCard key={booking.reference} booking={booking} onSelect={onSelect} />)}{!rows.length && !notes.length && !unavailable.length && <p className="py-9 text-center text-sm text-slate-400">No operations</p>}</div></section>;
  })}</div>;
}

function MonthGrid({ dates, anchor, bookings, events, onSelect }: { dates: string[]; anchor: string; bookings: Booking[]; events: CalendarEvent[]; onSelect: (reference: string) => void }) {
  return <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm"><div className="grid min-w-[980px] grid-cols-7">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <div key={day} className="border-b border-slate-200 bg-slate-100 p-3 text-xs font-black uppercase tracking-wider text-slate-500">{day}</div>)}{dates.map((date) => { const rows = bookings.filter((booking) => booking.pickupDate === date); const notes = events.filter((event) => instantDate(event.startsAt) === date); return <div key={date} className={`min-h-40 border-b border-r border-slate-100 p-2 ${date.slice(0, 7) !== anchor.slice(0, 7) ? "bg-slate-50 opacity-55" : ""}`}><p className={`mb-2 grid size-8 place-items-center rounded-full text-sm font-black ${date === todayInBangkok() ? "bg-[#FF8A05] text-white" : ""}`}>{Number(date.slice(-2))}</p><div className="space-y-1.5">{notes.map((event) => <div key={event.id} className="truncate rounded-lg bg-[#211726] px-2 py-1.5 text-xs font-bold text-white">{event.title}</div>)}{rows.slice(0, 3).map((booking) => <JourneyCard key={booking.reference} booking={booking} onSelect={onSelect} compact />)}{rows.length > 3 && <p className="px-2 text-xs font-bold text-[#D96F00]">+{rows.length - 3} more</p>}</div></div>; })}</div></div>;
}

function BookingPanel({ booking, driver, drivers, alerts, notifications, selectedDriver, setSelectedDriver, busy, onSave, onAssign }: { booking: Booking; driver?: Driver; drivers: Driver[]; alerts: OperationsAlert[]; notifications: Notification[]; selectedDriver: string; setSelectedDriver: (value: string) => void; busy: string; onSave: (updates: Record<string, unknown>) => Promise<boolean>; onAssign: () => Promise<boolean> }) {
  const [notes, setNotes] = useState(booking.internalNotes ?? "");
  const [attention, setAttention] = useState(booking.attentionStatus === "attention");
  const [reason, setReason] = useState(booking.attentionReason ?? "");
  const [pickupDate, setPickupDate] = useState(booking.pickupDate);
  const [pickupTime, setPickupTime] = useState(booking.pickupTime);
  const [preparation, setPreparation] = useState(String(booking.preparationBufferMinutes));
  const [postTrip, setPostTrip] = useState(String(booking.postTripBufferMinutes));
  return <>
    <SheetHeader className="border-b border-slate-100 px-6 py-5"><p className="text-xs font-black uppercase tracking-[.14em] text-[#D96F00]">Journey details</p><SheetTitle className="text-2xl font-black">{booking.reference}</SheetTitle><SheetDescription>{booking.customerName} · {booking.customerPhone}</SheetDescription></SheetHeader>
    <div className="space-y-5 px-6 pb-8">
      {booking.attention.reason && <div className={`rounded-2xl p-4 text-sm font-bold ${booking.attention.level === "critical" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}><AlertTriangle className="mb-2" size={19} />{booking.attention.reason}{booking.conflicts.map((conflict) => <p key={conflict} className="mt-1">{conflict}</p>)}</div>}
      <div className="rounded-2xl bg-slate-50 p-4"><p className="flex gap-3 font-bold"><MapPin className="shrink-0 text-[#FF8A05]" size={19} />{booking.pickup}</p><div className="ml-2.5 h-5 border-l-2 border-dotted border-slate-300" /><p className="flex gap-3 font-bold"><Route className="shrink-0 text-[#FF8A05]" size={19} />{booking.dropoff}</p><div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-500">{booking.routeDistanceMeters != null && <span>{(booking.routeDistanceMeters / 1000).toFixed(1)} km</span>}<span>{Math.round((booking.routeDurationSeconds ?? 3600) / 60)} min {booking.durationEstimated && "estimated"}</span><span>{booking.vehicle}</span></div></div>
      <div className="grid grid-cols-2 gap-3"><a href={`tel:${booking.customerPhone}`} className="flex h-11 items-center justify-center gap-2 rounded-full bg-[#211726] text-sm font-bold text-white"><Phone size={17} />Call customer</a><a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(booking.pickup)}`} target="_blank" rel="noreferrer" className="flex h-11 items-center justify-center gap-2 rounded-full border border-slate-200 text-sm font-bold"><Navigation size={17} />Navigate <ExternalLink size={13} /></a></div>
      <div className="grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 p-4 text-sm"><div><p className="text-xs font-bold uppercase text-slate-400">Travelers</p><p className="mt-1 flex items-center gap-2 font-black"><UsersRound size={17} />{booking.passengers} · {booking.luggage} bags</p></div><div><p className="text-xs font-bold uppercase text-slate-400">Payment</p><p className="mt-1 flex items-center gap-2 font-black"><CircleDollarSign size={17} />{booking.paymentMethod === "cash" ? "Cash" : "Paid online"} · ฿{booking.total.toLocaleString()}</p></div></div>
      <section className="rounded-2xl border border-slate-200 p-4"><h3 className="font-black">Driver assignment</h3>{booking.assignment ? <div className="mt-3 flex items-center justify-between rounded-xl bg-orange-50 p-3"><div><p className="font-black">{driver?.fullName ?? "Assigned driver"}</p><p className="text-sm text-slate-500">{statusNames[booking.assignment.currentStatus] ?? booking.assignment.currentStatus}</p></div><Truck className="text-[#D96F00]" /></div> : <div className="mt-3 flex gap-2"><select value={selectedDriver} onChange={(event) => setSelectedDriver(event.target.value)} className="field min-w-0 flex-1"><option value="">Choose driver</option>{drivers.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}</select><button disabled={!selectedDriver || Boolean(busy)} onClick={onAssign} className="rounded-full bg-[#FF8A05] px-5 text-sm font-bold text-white disabled:opacity-40">Assign</button></div>}</section>
      <section className="rounded-2xl border border-slate-200 p-4"><h3 className="font-black">Reminders & alerts</h3><div className="mt-3 space-y-2">{alerts.slice(0, 4).map((alert) => <div key={alert.id} className={`rounded-xl p-3 text-sm ${alert.status === "resolved" ? "bg-slate-50 text-slate-500" : alert.severity === "critical" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}><div className="flex justify-between gap-2"><strong>{alert.title}</strong><span className="text-xs capitalize">{alert.status}</span></div></div>)}{notifications.slice(0, 6).map((notification) => <div key={notification.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"><span className="font-bold">{notification.notificationType.replaceAll("_", " ")}</span><span className={`text-xs font-bold capitalize ${notification.status === "sent" ? "text-emerald-700" : notification.status === "failed" ? "text-red-700" : "text-slate-500"}`}>{notification.status}</span></div>)}{!alerts.length && !notifications.length && <p className="text-sm text-slate-500">No reminders or alerts recorded yet.</p>}</div></section>
      <section className="space-y-4 rounded-2xl border border-slate-200 p-4"><div className="flex items-center justify-between"><h3 className="font-black">Operations settings</h3><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={attention} onChange={(event) => setAttention(event.target.checked)} className="size-4 accent-[#FF8A05]" /><Flag size={16} />Needs attention</label></div><div className="grid grid-cols-2 gap-3"><Field label="Pickup date"><input type="date" value={pickupDate} onChange={(event) => setPickupDate(event.target.value)} className="field" /></Field><Field label="Pickup time"><input type="time" step="900" value={pickupTime} onChange={(event) => setPickupTime(event.target.value)} className="field" /></Field></div><div className="grid grid-cols-2 gap-3"><Field label="Preparation buffer"><input type="number" min="0" max="240" step="15" value={preparation} onChange={(event) => setPreparation(event.target.value)} className="field" /></Field><Field label="Post-trip buffer"><input type="number" min="0" max="240" step="15" value={postTrip} onChange={(event) => setPostTrip(event.target.value)} className="field" /></Field></div>{attention && <Field label="Attention reason"><input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={300} className="field" placeholder="What needs action?" /></Field>}<Field label="Internal notes"><textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={4} className="field resize-none" placeholder="Only administrators can see this" /></Field><button disabled={Boolean(busy)} onClick={() => onSave({ pickupDate, pickupTime, attentionStatus: attention ? "attention" : "normal", attentionReason: attention ? reason : "", internalNotes: notes, preparationBufferMinutes: Number(preparation), postTripBufferMinutes: Number(postTrip) })} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#211726] font-bold text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={17} /> : <CheckCircle2 size={17} />}Save operations details</button></section>
      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600"><p className="font-bold text-slate-900">Reserved time</p><p className="mt-1">{formatInstant(booking.operationalStartsAt)} – {formatInstant(booking.operationalEndsAt)}</p><p className="mt-2 text-xs">Includes preparation and post-trip buffers.</p></div>
    </div>
  </>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-bold text-slate-700"><span className="mb-2 block">{label}</span>{children}</label>;
}
