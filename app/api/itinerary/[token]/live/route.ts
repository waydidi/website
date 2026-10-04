import { NextResponse } from "next/server";
import { groupDays, tripByToken } from "@/lib/smart-trips";
import { liveFor } from "@/lib/trip-live-data";

// Customer "Your day": current and next stop and the driver's position, only for a paid trip.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const first = await tripByToken((await params).token);
  if (!first || first.status !== "accepted") return NextResponse.json({ error: "Not available" }, { status: 404 });
  const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
  const days = await groupDays(first);
  const trip = days.find((d) => d.tripDate === today) ?? days.find((d) => (d.tripDate ?? "") > today) ?? days.at(-1)!;
  const r = await liveFor(trip);
  if (!r) return NextResponse.json({ error: "Not available" }, { status: 404 });
  const { live, snap } = r;
  // Customers see progress and times, not the staff suggestions.
  return NextResponse.json({ state: live.state, delayMin: live.delayMin, current: live.current, next: live.next, driver: live.state === "live" ? live.driver : null,
    stops: live.stops.map(({ risk: _r, ...s }) => s), returnAt: live.returnAt, title: snap.title, tripDate: snap.tripDate, startTime: snap.startTime, pickupText: snap.pickupText, pickup: snap.pickup, packing: snap.packing,
    points: snap.stops.filter((s) => s.lat != null && s.lng != null && !(snap.liveSkipped ?? []).includes(s.id)).map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, name: s.name })) },
  { headers: { "Cache-Control": "no-store" } });
}
