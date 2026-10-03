import { NextResponse } from "next/server";
import { listAttractions } from "@/lib/attractions";
import { agencyActor } from "@/lib/trip-api";

// Agencies plan with Waydidi's attraction database: active places only, without internal notes or supplier contacts.
export async function GET(request: Request) {
  if (!(await agencyActor(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rows = await listAttractions();
  return NextResponse.json({ attractions: rows.map(({ internalNotes: _n, supplierId: _s, phone: _p, verifiedBy: _v, ...a }) => ({ ...a, usedIn: 0 })), suppliers: [] }, { headers: { "Cache-Control": "no-store" } });
}
