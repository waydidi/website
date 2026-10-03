import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { agencyApplications } from "@/db/schema";
import { safeOrigin } from "@/lib/security";
import { tripByToken, tripSnapshot } from "@/lib/smart-trips";
import { createTripPdf } from "@/lib/trip-pdf";

// Customer (or staff with the link): the itinerary PDF, always from the frozen version.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const trip = await tripByToken((await params).token);
  const snap = trip ? tripSnapshot(trip) : null;
  if (!trip || !snap || trip.status === "cancelled") return new Response("Not found", { status: 404 });
  const [agency] = trip.agencyId ? await getDb().select({ name: agencyApplications.agencyName }).from(agencyApplications).where(eq(agencyApplications.id, trip.agencyId)).limit(1) : [];
  const bytes = await createTripPdf(snap, safeOrigin(request), agency?.name ?? null);
  return new Response(new Blob([bytes as BlobPart], { type: "application/pdf" }), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Waydidi-${snap.ref}-itinerary.pdf"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
}
