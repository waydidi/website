import { agencyActor, handleItineraryPdf } from "@/lib/trip-api";

// Agency: the itinerary PDF of its own trip, as the customer gets it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return handleItineraryPdf(request, (await params).id, await agencyActor(request)); }
