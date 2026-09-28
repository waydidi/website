import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { adminOverview } from "@/lib/admin-overview";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// What needs the admin's attention, for the bell in the top bar.
export async function GET() {
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { alerts: a } = await adminOverview();
  const items = [
    { n: a.unassignedSoon, text: `${plural(a.unassignedSoon, "ride", "rides")} in the next 24h with no driver`, href: "/admin/operations", urgent: true },
    { n: a.attention, text: `${plural(a.attention, "booking", "bookings")} flagged as needing attention`, href: "/admin/operations", urgent: true },
    { n: a.operationsAlerts, text: `open operations ${plural(a.operationsAlerts, "alert", "alerts")}`, href: "/admin/operations", urgent: true },
    { n: a.changeRequests, text: `${plural(a.changeRequests, "change request", "change requests")} waiting`, href: "/admin/bookings", urgent: false },
    { n: a.ticketsToArrange, text: `partner ${plural(a.ticketsToArrange, "ticket", "tickets")} to arrange`, href: "/admin/gifts/mystery", urgent: false },
    { n: a.agencyApplications, text: `new agency ${plural(a.agencyApplications, "application", "applications")}`, href: "/admin/agencies", urgent: false },
    { n: a.driverApplications, text: `new driver ${plural(a.driverApplications, "application", "applications")}`, href: "/admin/drivers?tab=applications", urgent: false },
  ].filter((i) => i.n > 0);
  return NextResponse.json({ items }, { headers: { "Cache-Control": "no-store" } });
}
