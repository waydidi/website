// The Bookings phone list's Filter: pure rules (no runtime imports) so they are unit tested directly.

export type BookingFilter = {
  when: "all" | "today" | "week" | "past";
  driver: "all" | "assigned" | "not_assigned";
  payment: "all" | "paid" | "cash" | "other";
  status: "all" | "confirmed" | "pending_payment" | "completed" | "cancelled";
};
export const NO_FILTER: BookingFilter = { when: "all", driver: "all", payment: "all", status: "all" };

export const FILTER_OPTIONS: { key: keyof BookingFilter; label: string; options: [BookingFilter[keyof BookingFilter], string][] }[] = [
  { key: "when", label: "Date", options: [["all", "All"], ["today", "Today"], ["week", "Next 7 days"], ["past", "Past"]] },
  { key: "driver", label: "Driver", options: [["all", "All"], ["not_assigned", "Not assigned"], ["assigned", "Assigned"]] },
  { key: "payment", label: "Payment", options: [["all", "All"], ["paid", "Paid"], ["cash", "Collect cash"], ["other", "Awaiting payment"]] },
  { key: "status", label: "Status", options: [["all", "All"], ["confirmed", "Confirmed"], ["pending_payment", "Awaiting payment"], ["completed", "Completed"], ["cancelled", "Cancelled"]] },
];

/** `primary: false` is a round trip's other journey; `legDone` says this journey itself is finished. */
type Ride = { pickupDate: string; driverId: string | null; paymentStatus?: string | null; status: string; primary?: boolean; legDone?: boolean };
const isDone = (r: Ride) => r.legDone === true || r.status === "completed" || r.status === "no_show";

const addDays = (date: string, days: number) => { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10); };
/** Thailand's date today ("2026-10-14"). */
export const bangkokToday = (now = new Date()) => new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);

/** How many of the four filters are not "All". */
export const activeFilters = (f: BookingFilter) => (Object.keys(NO_FILTER) as (keyof BookingFilter)[]).filter((k) => f[k] !== "all").length;

const paymentGroup = (s?: string | null) => (s === "paid" || s === "partially_refunded" ? "paid" : s === "cash_due" ? "cash" : "other");

export function matchesFilter(r: Ride, f: BookingFilter, today: string) {
  if (f.when === "today" && r.pickupDate !== today) return false;
  if (f.when === "week" && !(r.pickupDate >= today && r.pickupDate <= addDays(today, 7))) return false;
  if (f.when === "past" && !(r.pickupDate < today)) return false;
  if (f.driver === "assigned" && !r.driverId) return false;
  if (f.driver === "not_assigned" && r.driverId) return false;
  if (f.payment !== "all" && paymentGroup(r.paymentStatus) !== f.payment) return false;
  if (f.status === "completed" ? !isDone(r) : f.status !== "all" && r.status !== f.status) return false;
  return true;
}

/**
 * A round trip shows one card (its current trip). Under the Completed filter each finished trip is its own card: the
 * first trip as soon as it is done, even while the second trip is still to come, and the second trip once it ends.
 */
export const applyFilter = <T extends Ride>(rides: T[], f: BookingFilter, today: string) => {
  const pool = f.status === "completed" ? rides : rides.filter((r) => r.primary !== false);
  return activeFilters(f) ? pool.filter((r) => matchesFilter(r, f, today)) : pool;
};

/** Reads a saved filter, ignoring anything that is not one of the known options. */
export function parseFilter(raw: unknown): BookingFilter {
  const out = { ...NO_FILTER };
  if (raw && typeof raw === "object") for (const group of FILTER_OPTIONS) {
    const value = (raw as Record<string, unknown>)[group.key];
    if (group.options.some(([v]) => v === value)) (out as Record<string, unknown>)[group.key] = value;
  }
  return out;
}
