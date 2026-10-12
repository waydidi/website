import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { customerBooking, customerFromRequest, overRateLimit } from "@/lib/customer-auth";
import { SLIP_MAX_BYTES, sniffSlipImage } from "@/lib/payment-slip-rules";
import { customerSlipView, slipsForBooking, submitSlip } from "@/lib/payment-slips";
import { sameOrigin } from "@/lib/security";

type Params = { params: Promise<{ reference: string }> };
const noStore = { "Cache-Control": "no-store" };

async function ownTrip(request: Request, context: Params) {
  const session = await customerFromRequest(request);
  if (!session) return { error: NextResponse.json({ error: "Please sign in." }, { status: 401, headers: noStore }) };
  const { reference } = await context.params;
  const trip = await customerBooking(session.customer, reference.toUpperCase().slice(0, 40));
  if (!trip) return { error: NextResponse.json({ error: "Booking not found." }, { status: 404, headers: noStore }) };
  return { customer: session.customer, trip };
}

export async function GET(request: Request, context: Params) {
  const own = await ownTrip(request, context);
  if (own.error) return own.error;
  return NextResponse.json({ slips: (await slipsForBooking(own.trip.reference)).map(customerSlipView) }, { headers: noStore });
}

/** Multipart upload with one `slip` image (JPEG, PNG or WebP, up to 5 MB). */
export async function POST(request: Request, context: Params) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const own = await ownTrip(request, context);
  if (own.error) return own.error;
  if (await overRateLimit(request, "payment-slip", 12, 60, (env as unknown as Record<string, string | undefined>).RATE_LIMIT_SALT ?? "waydidi"))
    return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429, headers: noStore });
  if (Number(request.headers.get("content-length") ?? 0) > SLIP_MAX_BYTES + 64 * 1024) return NextResponse.json({ error: "The image must be 5 MB or smaller." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("slip");
  if (!file || typeof file === "string") return NextResponse.json({ error: "Choose a slip image." }, { status: 400 });
  if (file.size > SLIP_MAX_BYTES) return NextResponse.json({ error: "The image must be 5 MB or smaller." }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffSlipImage(bytes);
  if (!mime) return NextResponse.json({ error: "Upload a JPEG, PNG or WebP image of the slip." }, { status: 415 });
  const result = await submitSlip({ reference: own.trip.reference, customerId: own.customer.id, bytes, mime });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: noStore });
  return NextResponse.json({ slip: result.slip }, { headers: noStore });
}
