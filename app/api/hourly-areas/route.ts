import { NextResponse } from "next/server";
import { hourlyAreaSettings } from "@/lib/hourly-area-pricing";

// Cities offered by the hour, in admin order (borders are in lib/hourly-areas-data.ts).
export async function GET() {
  const areas = await hourlyAreaSettings();
  return NextResponse.json({ areas: areas.filter((a) => a.active).map((a) => a.slug) }, { headers: { "Cache-Control": "public, max-age=300" } });
}
