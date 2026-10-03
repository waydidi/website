import { NextResponse } from "next/server";
import { adminActor } from "@/lib/trip-api";
import { liveFor, tripsToday } from "@/lib/trip-live-data";

// Admin: today's booked trips, each with its live status, risks and suggestions.
export async function GET() {
  if (!(await adminActor())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const trips = await tripsToday();
  const out = [];
  for (const t of trips) {
    const r = await liveFor(t);
    if (r) out.push({ id: t.id, ref: t.ref, title: t.title, customerName: t.customerName, customerPhone: t.customerPhone, bookingReference: t.bookingReference, startTime: t.startTime, live: r.live });
  }
  out.sort((a, b) => b.live.risks.length - a.live.risks.length || b.live.delayMin - a.live.delayMin);
  return NextResponse.json({ trips: out, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
