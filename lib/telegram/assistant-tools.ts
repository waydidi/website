import { env } from "cloudflare:workers";
import type { BetaTool } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { CHILD_SEAT_THB, EXCHANGE_STOP_THB, FERRY_HOTEL_THB } from "@/lib/addons";
import { CHARGEABLE_SQL, COMMITTED_SQL } from "@/lib/booking-status";
import { searchKnowledge } from "@/lib/cee/knowledge";
import { findPackages, quoteHourly, quoteTransfer } from "@/lib/cee/quotes";
import { SUPPORT_EMAIL, WHATSAPP } from "@/lib/contact";
import { LOYALTY_CAP, LOYALTY_EVERY, LOYALTY_PERCENT } from "@/lib/loyalty-rules";
import { TIERS } from "@/lib/member-tier-rules";
import { revenueReport } from "@/lib/reports";
import { FULL_REFUND_HOURS, GENERAL_REFUND_TIERS, PARTIAL_REFUND_HOURS, PARTIAL_REFUND_PERCENT, REFUND_POLICY_VERSION } from "@/lib/refund-policy";
import { SITE_URL } from "@/lib/site";
import { allowedStaffRoute, type StaffRole } from "@/lib/staff-security";
import { driverJobText } from "@/lib/telegram/job-text";
import { bangkokToday, looksLikeReference, namePattern } from "@/lib/telegram/job-lookup-rules";
import { VEHICLES } from "@/lib/vehicles";

// Read-only lookups the Telegram assistant may call. Every answer comes from Waydidi's own
// data and rule files (the single sources of truth), never from the model's memory, and each
// lookup is allowed only if the asker's staff role may open the same data in Admin.

type Stmt = { bind: (...v: unknown[]) => Stmt; all: <T>() => Promise<{ results: T[] }>; first: <T>() => Promise<T | null> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };

/** Admin areas each lookup reads. A role may use it if Admin lets it open any of them. */
const AREAS: Record<string, string[]> = {
  search_bookings: ["/api/admin/bookings", "/api/admin/payments"],
  get_booking: ["/api/admin/bookings", "/api/admin/payments"],
  schedule: ["/api/admin/bookings"],
  search_drivers: ["/api/admin/drivers"],
  revenue_report: ["/api/admin/reports"],
  payments_overview: ["/api/admin/payments"],
  open_chats: ["/api/admin/chat"],
};
export function mayUse(role: StaffRole, tool: string) {
  const areas = AREAS[tool];
  return !areas || areas.some((path) => allowedStaffRoute(role, path, "GET"));
}
const seesMoney = (role: StaffRole) => allowedStaffRoute(role, "/api/admin/payments", "GET");

const str = { type: "string" } as const;
const int = { type: "integer" } as const;
const tool = (name: string, description: string, properties: Record<string, unknown>, required: string[] = Object.keys(properties)): BetaTool =>
  ({ name, description, strict: true, input_schema: { type: "object", additionalProperties: false, required, properties } }) as BetaTool;
const range = { date_from: { ...str, description: "YYYY-MM-DD (Bangkok), inclusive" }, date_to: { ...str, description: "YYYY-MM-DD (Bangkok), inclusive" } };

export const ASSISTANT_TOOLS: BetaTool[] = [
  tool("waydidi_facts", "Waydidi's rules and fixed facts from the source files: vehicles (seats, bags, starting prices), refund policy, add-on prices, member tiers, loyalty reward, contact details, website. Use for any policy, price-list or 'how does Waydidi work' question.", {}),
  tool("search_bookings", "Find bookings by customer name, surname, booking reference, phone or email, and/or pickup date range. Returns up to 25, nearest pickup first.",
    { query: { ...str, description: "Name, reference, phone or email; empty string for all" }, ...range, status: { type: "string", enum: ["any", "committed", "cancelled", "pending"], description: "committed = confirmed or completed" } }),
  tool("get_booking", "Everything about one booking: trip, customer contact, payment, driver assignment and status, add-ons, notes, and the Thai driver job message.", { reference: str }),
  tool("schedule", "Committed trips between two dates with their assigned driver (or none), in pickup order. Use for 'what's on tomorrow', 'who drives at 6am', 'unassigned jobs'.", range),
  tool("search_drivers", "Drivers by name, phone or plate (empty string for all), with their next assigned jobs.", { query: str }),
  tool("revenue_report", "Money for trips with pickup dates in the range: revenue, discounts, driver costs, profit, by vehicle, payment method and top routes.", range),
  tool("payments_overview", "Payments right now: received, refunded, cash still to collect (with bookings), driver costs missing, disputes, and transfer slips waiting for review.", {}),
  tool("open_chats", "Website, WhatsApp and LINE customer chats that are not closed, newest first, with who they are assigned to.", {}),
  tool("quote_transfer", "Live price for an A-to-B transfer from Waydidi's price tables.", { pickup: str, dropoff: str, date: { ...str, description: "YYYY-MM-DD" }, time: { ...str, description: "HH:MM" }, passengers: int, bags: int }),
  tool("quote_hourly", "Live price for hourly car with driver from Waydidi's price tables.", { city: str, pickup: str, hours: int, date: { ...str, description: "YYYY-MM-DD" }, time: { ...str, description: "HH:MM" }, passengers: int, bags: int }),
  tool("find_packages", "Published day trips and tour packages in a city, with prices.", { city: str }),
  tool("search_knowledge", "The team's written notes (Admin → Chat → Non knowledge) and the attractions database.", { query: str, city: { ...str, description: "City or empty string" } }),
];

type BookingRow = Record<string, string | number | null>;
const SUMMARY = `b.reference,b.status,b.customer_name,b.customer_surname,b.pickup,b.dropoff,b.pickup_date,b.pickup_time,b.vehicle,b.passengers,b.luggage,
  b.payment_method,b.payment_status,b.total,b.service_type,b.return_date,b.return_time,
  (SELECT d.full_name FROM booking_assignments a JOIN drivers d ON d.id=a.driver_id WHERE a.booking_reference=b.reference AND a.leg='outbound' AND a.revoked_at IS NULL LIMIT 1) AS driver`;

function statusClause(status: string) {
  if (status === "committed") return `b.status IN (${COMMITTED_SQL})`;
  if (status === "cancelled") return "b.status='cancelled'";
  if (status === "pending") return "b.status='pending'";
  return "b.status<>'binned'";
}

const json = (value: unknown) => JSON.stringify(value);

export async function runAssistantTool(name: string, input: Record<string, unknown>, role: StaffRole): Promise<string> {
  if (!mayUse(role, name)) return json({ ok: false, reason: `Not available to the ${role} role. Say the asker's Admin role cannot see this.` });
  const s = (k: string) => String(input[k] ?? "").trim();
  const n = (k: string) => Number(input[k] ?? 0);

  if (name === "waydidi_facts") return json({
    website: SITE_URL, contact: { email: SUPPORT_EMAIL, whatsapp: WHATSAPP },
    vehicles: Object.entries(VEHICLES).map(([id, v]) => ({ id, ...v, total_note: "starting price in THB" })),
    refund_policy: { version: REFUND_POLICY_VERSION, full_refund_more_than_hours: FULL_REFUND_HOURS, partial_refund_percent: PARTIAL_REFUND_PERCENT, partial_from_hours: PARTIAL_REFUND_HOURS, tiers: GENERAL_REFUND_TIERS.map((t) => ({ label: t.label, percent: t.percent })), no_show: "no refund", waydidi_cancels: "full refund" },
    add_ons_thb: { child_seat: CHILD_SEAT_THB, currency_exchange_stop: EXCHANGE_STOP_THB, ferry_hotel_per_person: FERRY_HOTEL_THB },
    member_tiers: TIERS.map((t) => ({ name: t.name, completed_rides: t.rides, or_spend_thb_12_months: t.spend, perks: t.perks })),
    loyalty: { every_nth_completed_ride: LOYALTY_EVERY, percent_off: LOYALTY_PERCENT, cap_thb: LOYALTY_CAP },
  });

  if (name === "search_bookings") {
    const q = s("query"), where: string[] = [statusClause(s("status"))], params: unknown[] = [];
    if (q) {
      if (looksLikeReference(q)) { where.push("(b.reference=? OR lower(b.customer_name||' '||COALESCE(b.customer_surname,'')) LIKE ? ESCAPE '\\')"); params.push(q.toUpperCase(), namePattern(q)); }
      else {
        const digits = q.replace(/\D/g, "");
        where.push(`(lower(b.customer_name||' '||COALESCE(b.customer_surname,'')) LIKE ? ESCAPE '\\' OR lower(COALESCE(b.customer_surname,'')||' '||b.customer_name) LIKE ? ESCAPE '\\' OR lower(b.customer_email) LIKE ? ESCAPE '\\'${digits.length >= 6 ? " OR replace(replace(replace(b.customer_phone,' ',''),'-',''),'+','') LIKE ?" : ""})`);
        params.push(namePattern(q), namePattern(q), namePattern(q), ...(digits.length >= 6 ? [`%${digits.slice(-9)}%`] : []));
      }
    }
    if (s("date_from")) { where.push("b.pickup_date>=?"); params.push(s("date_from")); }
    if (s("date_to")) { where.push("b.pickup_date<=?"); params.push(s("date_to")); }
    const { results } = await db().prepare(`SELECT ${SUMMARY} FROM bookings b WHERE ${where.join(" AND ")} ORDER BY abs(julianday(b.pickup_date)-julianday(?)), b.pickup_time LIMIT 25`).bind(...params, bangkokToday()).all<BookingRow>();
    return json(results.length ? results : { none: "No bookings match." });
  }

  if (name === "get_booking") {
    const ref = s("reference").toUpperCase();
    const b = await db().prepare("SELECT * FROM bookings WHERE reference=? AND status<>'binned'").bind(ref).first<BookingRow>();
    if (!b) return json({ none: `No booking ${ref}.` });
    const [assignments, cost, maps] = await Promise.all([
      db().prepare("SELECT a.leg,a.current_status,a.assigned_at,d.full_name,d.phone,d.car_plate,d.vehicle FROM booking_assignments a JOIN drivers d ON d.id=a.driver_id WHERE a.booking_reference=? AND a.revoked_at IS NULL").bind(ref).all<BookingRow>(),
      db().prepare("SELECT agreed_driver_cost,total_driver_cost,payment_status FROM booking_costs WHERE booking_reference=?").bind(ref).first<BookingRow>().catch(() => null),
      db().prepare("SELECT pickup_map_url,dropoff_map_url FROM booking_map_links WHERE booking_reference=?").bind(ref).first<{ pickup_map_url: string | null; dropoff_map_url: string | null }>().catch(() => null),
    ]);
    const keep = ["reference", "status", "service_type", "customer_name", "customer_surname", "customer_email", "customer_phone", "pickup", "dropoff", "pickup_date", "pickup_time", "flight_number", "flight_status", "passengers", "luggage", "child_seats", "oversized_luggage", "special_requests", "pickup_sign", "vehicle", "booked_hours", "pricing_area", "return_pickup", "return_dropoff", "return_date", "return_time", "payment_method", "payment_status", "total", "amount_paid", "refund_status", "refund_amount", "cancellation_reason", "attention_status", "attention_reason", "internal_notes", "created_at"];
    const booking = Object.fromEntries(keep.filter((k) => b[k] !== null && b[k] !== "" && b[k] !== 0 || ["total", "passengers"].includes(k)).map((k) => [k, b[k]]));
    const driverCost = cost ? Number(cost.total_driver_cost) || Number(cost.agreed_driver_cost) || null : null;
    const job = driverJobText({ reference: ref, vehicle: String(b.vehicle), customerName: String(b.customer_name), customerSurname: b.customer_surname as string | null, passengers: Number(b.passengers), luggage: Number(b.luggage),
      pickupDate: String(b.pickup_date), pickupTime: String(b.pickup_time), pickup: String(b.pickup), dropoff: String(b.dropoff),
      serviceType: b.service_type as string | null, pricingArea: b.pricing_area as string | null, bookedHours: b.booked_hours as number | null }, driverCost, { pickup: maps?.pickup_map_url, dropoff: maps?.dropoff_map_url });
    return json({ booking, drivers: assignments.results, ...(seesMoney(role) ? { driver_cost_thb: driverCost, driver_cost_paid: cost?.payment_status ?? null } : {}), driver_job_message: job, admin_link: `${SITE_URL}/admin/journeys/${ref}` });
  }

  if (name === "schedule") {
    const { results } = await db().prepare(`SELECT ${SUMMARY},b.flight_number FROM bookings b WHERE b.status IN (${COMMITTED_SQL}) AND b.pickup_date BETWEEN ? AND ? ORDER BY b.pickup_date,b.pickup_time LIMIT 60`).bind(s("date_from"), s("date_to")).all<BookingRow>();
    return json(results.length ? results : { none: "No trips in that range." });
  }

  if (name === "search_drivers") {
    const q = s("query"), digits = q.replace(/\D/g, "");
    const { results } = await db().prepare(`SELECT d.id,d.full_name,d.phone,d.vehicle,d.car_plate,d.base_location,d.status FROM drivers d
      WHERE ?='' OR lower(d.full_name) LIKE ? ESCAPE '\\' OR lower(COALESCE(d.car_plate,'')) LIKE ? ESCAPE '\\'${digits.length >= 6 ? " OR replace(replace(replace(d.phone,' ',''),'-',''),'+','') LIKE ?" : ""}
      ORDER BY d.full_name LIMIT 20`).bind(q, namePattern(q), namePattern(q), ...(digits.length >= 6 ? [`%${digits.slice(-9)}%`] : [])).all<BookingRow>();
    const withJobs = await Promise.all(results.map(async (d) => ({ ...d, next_jobs: (await db().prepare(`SELECT b.reference,b.pickup_date,b.pickup_time,b.pickup,b.dropoff,a.leg,a.current_status FROM booking_assignments a JOIN bookings b ON b.reference=a.booking_reference
      WHERE a.driver_id=? AND a.revoked_at IS NULL AND b.status IN (${CHARGEABLE_SQL}) AND b.pickup_date>=? ORDER BY b.pickup_date,b.pickup_time LIMIT 5`).bind(d.id, bangkokToday()).all<BookingRow>()).results })));
    // The internal driver id stays out of the answer.
    for (const d of withJobs as Record<string, unknown>[]) delete d.id;
    return json(withJobs.length ? withJobs : { none: "No drivers match." });
  }

  if (name === "revenue_report") {
    const r = await revenueReport({ from: s("date_from"), to: s("date_to") }, "month");
    return json({ trips: r.trips.length, total: r.total, by_month: r.periods, by_payment: r.payment, by_vehicle: r.vehicles, top_routes: r.routes });
  }

  if (name === "payments_overview") {
    const { paymentDashboard } = await import("@/lib/payment-dashboard");
    const d = await paymentDashboard();
    const slips = await db().prepare("SELECT booking_reference,amount_minor,created_at FROM payment_slips WHERE status='needs_review' ORDER BY created_at LIMIT 20").all<BookingRow>().catch(() => ({ results: [] }));
    return json({ summary_thb: Object.fromEntries(Object.entries(d.summary).map(([k, v]) => [k.replace(/Minor$/, ""), typeof v === "number" && k.endsWith("Minor") ? v / 100 : v])),
      cash_to_collect: d.rows.filter((r) => r.cashDueMinor + r.overtimeDueMinor > 0).slice(0, 15).map((r) => ({ reference: r.reference, customer: r.customer, cash_due_thb: (r.cashDueMinor + r.overtimeDueMinor) / 100 })),
      disputes: d.rows.filter((r) => r.status === "disputed").map((r) => r.reference),
      transfer_slips_waiting: slips.results.map((x) => ({ reference: x.booking_reference, amount_thb: x.amount_minor == null ? null : Number(x.amount_minor) / 100, uploaded: x.created_at })) });
  }

  if (name === "open_chats") {
    const { results } = await db().prepare("SELECT public_id,status,channel,customer_name,topic,assigned_name,last_message_at FROM website_conversations WHERE status<>'closed' ORDER BY COALESCE(last_message_at,created_at) DESC LIMIT 20").all<BookingRow>();
    return json(results.length ? results : { none: "No open chats." });
  }

  if (name === "quote_transfer") return json(await quoteTransfer({ pickup: s("pickup"), dropoff: s("dropoff"), date: s("date"), time: s("time"), passengers: n("passengers"), bags: n("bags") }));
  if (name === "quote_hourly") return json(await quoteHourly({ city: s("city"), pickup: s("pickup"), hours: n("hours"), date: s("date"), time: s("time"), passengers: n("passengers"), bags: n("bags") }));
  if (name === "find_packages") return json(await findPackages(s("city")));
  if (name === "search_knowledge") return json(await searchKnowledge(s("query"), s("city") || null));
  return json({ ok: false, reason: `Unknown lookup ${name}.` });
}
