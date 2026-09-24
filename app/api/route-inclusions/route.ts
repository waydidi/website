import { NextResponse } from "next/server";
import { loadInclusions } from "@/lib/route-inclusions-db";

// What a fare includes between two points (used by the prototype route; real
// quotes carry this from /api/fare-quote).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const [plat, plng, dlat, dlng] = ["plat", "plng", "dlat", "dlng"].map((k) => Number(url.searchParams.get(k)));
  const ok = [plat, plng, dlat, dlng].every(Number.isFinite) && [plat, dlat].every((v) => v > 5 && v < 21) && [plng, dlng].every((v) => v > 96 && v < 106);
  if (!ok) return NextResponse.json({ error: "Invalid route" }, { status: 400 });
  const inclusions = await loadInclusions({ lat: plat, lng: plng }, { lat: dlat, lng: dlng });
  return NextResponse.json({ inclusions }, { headers: { "Cache-Control": "public, max-age=300" } });
}
