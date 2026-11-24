import { NextResponse } from "next/server";
import { isRideId } from "@/lib/ride-search-rules";
import { loadRideSearch } from "@/lib/ride-search-db";

// Opens a saved search by its ride ID. Anyone with the link may open it (it holds
// trip inputs only); the price is worked out again by /api/fare-quote.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (!isRideId(id)) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  const ride = await loadRideSearch(id);
  if (!ride) return NextResponse.json({ error: "Not found" }, { status: 404, headers });
  return NextResponse.json({ ride }, { headers });
}
