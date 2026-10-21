import { adminActor, handleItineraryPdf } from "@/lib/trip-api";

// Admin: the itinerary PDF as the customer gets it.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) { return handleItineraryPdf(request, (await params).id, await adminActor()); }
