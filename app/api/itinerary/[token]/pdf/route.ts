import { safeOrigin } from "@/lib/security";
import { tripByToken } from "@/lib/smart-trips";
import { itineraryPdf } from "@/lib/trip-itinerary-file";

// Customer (or staff with the link): the itinerary PDF, always from the frozen version.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const trip = await tripByToken((await params).token);
  if (!trip || trip.isTemplate || ["draft", "pricing", "cancelled"].includes(trip.status)) return new Response("Not found", { status: 404 });
  const file = await itineraryPdf(trip, safeOrigin(request));
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Blob([file.bytes as BlobPart], { type: "application/pdf" }), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Waydidi-${file.ref}-itinerary.pdf"`, "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
}
