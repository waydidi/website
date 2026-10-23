import { NextResponse } from "next/server";
import { z } from "zod";
import { getWaydidiAdmin } from "@/lib/admin";
import { findFreePhotos, googlePlaceFacts, importFreePhoto } from "@/lib/place-autofill";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("google"), placeId: z.string().trim().max(200).nullable().optional(), query: z.string().trim().max(200).nullable().optional() }),
  z.object({ action: z.literal("photos"), name: z.string().trim().max(120), lat: z.number().min(-90).max(90).nullable().optional(), lng: z.number().min(-180).max(180).nullable().optional() }),
  z.object({ action: z.literal("import"), urls: z.array(z.string().max(1000)).min(1).max(12) }),
]);
const noStore = { "Cache-Control": "no-store" };

// Admin: fill a place from Google Maps, find free photos of it, and copy chosen ones into the file store.
export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the request." }, { status: 400 });
  const b = parsed.data;
  if (b.action === "google") {
    if (!b.placeId && !b.query) return NextResponse.json({ error: "Pick the place in Location, or type its name first." }, { status: 400 });
    const place = await googlePlaceFacts(b);
    return place ? NextResponse.json({ ok: true, place }, { headers: noStore }) : NextResponse.json({ error: "Not found on Google Maps (or Google Maps is not connected)." }, { status: 404 });
  }
  if (b.action === "photos") {
    if (b.name.length < 3 && (b.lat == null || b.lng == null)) return NextResponse.json({ error: "Add the place's name or pick it in Location first." }, { status: 400 });
    return NextResponse.json({ ok: true, photos: await findFreePhotos(b) }, { headers: noStore });
  }
  const urls: (string | null)[] = [];
  for (const url of b.urls) urls.push(await importFreePhoto(url));
  return NextResponse.json({ ok: true, urls }, { headers: noStore });
}
