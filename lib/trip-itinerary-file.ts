import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import { getDb } from "@/db";
import { agencyApplications } from "@/db/schema";
import { groupDays, tripSnapshot, type TripRow } from "@/lib/smart-trips";
import { createTripPdf } from "@/lib/trip-pdf";

/**
 * The itinerary PDF exactly as the customer gets it: made from the version that was sent (the frozen snapshot), all
 * days of a multi-day trip in one file. The customer's link and the Admin / Agency download both come from here,
 * so they are the same file. Null while nothing has been sent.
 */
export async function itineraryPdf(trip: TripRow, origin: string): Promise<{ bytes: Uint8Array; ref: string } | null> {
  const snap = tripSnapshot(trip);
  if (!snap) return null;
  const [agency] = trip.agencyId ? await getDb().select({ name: agencyApplications.agencyName }).from(agencyApplications).where(eq(agencyApplications.id, trip.agencyId)).limit(1) : [];
  const days = (await groupDays(trip)).map((d) => tripSnapshot(d)).filter((d): d is NonNullable<typeof d> => Boolean(d));
  let bytes = await createTripPdf(days[0] ?? snap, origin, agency?.name ?? null, days.length > 1 ? 1 : undefined);
  if (days.length > 1) {
    const merged = await PDFDocument.create({ updateMetadata: false });
    for (const [i, d] of days.entries()) {
      const part = await PDFDocument.load(i === 0 ? bytes : await createTripPdf(d, origin, agency?.name ?? null, i + 1));
      for (const page of await merged.copyPages(part, part.getPageIndices())) merged.addPage(page);
    }
    bytes = await merged.save();
  }
  return { bytes, ref: snap.ref };
}
