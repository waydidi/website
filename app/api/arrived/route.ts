import { NextResponse } from "next/server";
import { arrivedHere } from "@/lib/arrived";

// Public: "Someone arrived here …" for the results map. Returns only the sentence.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const place = (url.searchParams.get("place") ?? "").slice(0, 300);
  const lat = Number(url.searchParams.get("lat")), lng = Number(url.searchParams.get("lng"));
  const point = Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
  const text = await arrivedHere(place, point).catch(() => null);
  return NextResponse.json({ text }, { headers: { "Cache-Control": "public, max-age=600" } });
}
