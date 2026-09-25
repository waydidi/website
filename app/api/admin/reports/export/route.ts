import { getWaydidiAdmin } from "@/lib/admin";
import { driverPayouts, revenueReport, toCsv } from "@/lib/reports";
import { VEHICLES } from "@/lib/vehicles";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const vehicleName = (id: string) => (VEHICLES as Record<string, { name: string }>)[id]?.name ?? id;

// Admin-only CSV downloads: every trip in the range, or driver payouts.
export async function GET(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return new Response("Unauthorized", { status: 401 });
  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? "", to = url.searchParams.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to) || from > to) return new Response("Choose a valid date range.", { status: 400 });
  const type = url.searchParams.get("type");
  let csv: string;
  if (type === "payouts") {
    const groups = await driverPayouts({ from, to });
    csv = toCsv([
      ["Week starting", "Driver", "Phone", "Bank", "Account number", "Account name", "Booking", "Trip date", "Route", "Fare (THB)", "Driver cost (THB)", "Payout status"],
      ...groups.flatMap((g) => g.trips.map((t) => [g.week, g.driverName, g.phone, g.bank.code, g.bank.account, g.bank.name, t.reference, t.pickupDate, t.route, t.fare, t.cost, t.cost == null ? "cost not set" : t.status])),
    ]);
  } else {
    const { trips } = await revenueReport({ from, to }, "day");
    csv = toCsv([
      ["Booking", "Trip date", "Service", "Pickup", "Drop-off", "Vehicle", "Payment", "Status", "Revenue (THB)", "Promo discount (THB)", "Member discount (THB)", "Driver cost (THB)", "Margin (THB)"],
      ...trips.sort((a, b) => a.pickupDate.localeCompare(b.pickupDate)).map((t) => [t.reference, t.pickupDate, t.serviceType, t.pickup, t.dropoff, vehicleName(t.vehicle), t.paymentMethod, t.status, t.total, t.promoDiscount, t.memberDiscount, t.driverCost, t.driverCost == null ? null : t.total - t.driverCost]),
    ]);
  }
  const name = `waydidi-${type === "payouts" ? "driver-payouts" : "revenue"}-${from}-to-${to}.csv`;
  return new Response("﻿" + csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
