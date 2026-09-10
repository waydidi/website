import { NextResponse } from "next/server";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import {
  bookingEvents,
  bookings,
  checkoutAttempts,
  fareQuotes,
  hourlyQuotes,
} from "@/db/schema";
import { createCheckoutSession, VEHICLES, type VehicleId } from "@/lib/stripe";
import { fulfillBooking } from "@/lib/booking-fulfillment";
import {
  isJsonRequest,
  safeOrigin,
  sameOrigin,
  secureToken,
  sha256,
} from "@/lib/security";

type Payload = {
  customerName: string;
  customerEmail: string;
  pickup: string;
  dropoff: string;
  pickupDate: string;
  pickupTime: string;
  passengers: number;
  luggage: number;
  vehicle: VehicleId;
  customerPhone: string;
  flightNumber?: string;
  pickupSign?: string;
  pickupInstructions?: string;
  childSeats: number;
  oversizedLuggage: boolean;
  specialRequests?: string;
  termsAccepted: boolean;
  paymentMethod?: "card" | "cash";
  fareQuoteId?: string;
  serviceType?: "transfer" | "hourly";
  bookedHours?: number;
  hourlyQuoteId?: string;
};

const POLICY_VERSION = "2026-09-07";

function textWithin(value: unknown, maximum: number) {
  return typeof value === "string" && value.trim().length <= maximum;
}

function validPickup(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    return false;
  const [hours, minutes] = time.split(":").map(Number);
  if (hours > 23 || minutes > 59 || minutes % 15 !== 0) return false;
  const pickup = new Date(`${date}T${time}:00+07:00`).getTime();
  return (
    Number.isFinite(pickup) &&
    pickup > Date.now() &&
    pickup < Date.now() + 1000 * 60 * 60 * 24 * 730
  );
}

function valid(input: Payload) {
  return (
    input.customerName?.trim().length >= 2 &&
    /^\S+@\S+\.\S+$/.test(input.customerEmail) &&
    typeof input.customerPhone === "string" &&
    /^[+0-9() .-]{7,30}$/.test(input.customerPhone.trim()) &&
    input.pickup?.trim().length >= 2 &&
    (input.serviceType === "hourly" || input.dropoff?.trim().length >= 2) &&
    validPickup(input.pickupDate, input.pickupTime) &&
    Number.isInteger(input.passengers) &&
    input.passengers > 0 &&
    input.passengers <= 9 &&
    Number.isInteger(input.luggage) &&
    input.luggage >= 0 &&
    input.luggage <= 12 &&
    Number.isInteger(input.childSeats) &&
    input.childSeats >= 0 &&
    input.childSeats <= 4 &&
    typeof input.oversizedLuggage === "boolean" &&
    input.termsAccepted === true &&
    input.vehicle in VEHICLES &&
    (input.paymentMethod === "card" || input.paymentMethod === "cash") &&
    textWithin(input.flightNumber ?? "", 30) &&
    textWithin(input.pickupSign ?? "", 80) &&
    textWithin(input.pickupInstructions ?? "", 500) &&
    textWithin(input.specialRequests ?? "", 500) &&
    (!input.fareQuoteId || /^[0-9a-f-]{36}$/i.test(input.fareQuoteId))
    && (input.serviceType !== "hourly" || (Number.isInteger(input.bookedHours) && input.bookedHours! >= 3 && input.bookedHours! <= 12 && !!input.hourlyQuoteId && /^[0-9a-f-]{36}$/i.test(input.hourlyQuoteId)))
  );
}

export async function POST(request: Request) {
  let createdReference = "";
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json(
        { error: "Cross-site request blocked." },
        { status: 403 },
      );
    }
    if (!isJsonRequest(request)) {
      return NextResponse.json(
        { error: "Unsupported request." },
        { status: 415 },
      );
    }
    const address =
      request.headers.get("cf-connecting-ip") ??
      request.headers.get("x-real-ip") ??
      "unknown";
    const agent = request.headers.get("user-agent") ?? "unknown";
    const fingerprint = await sha256(
      `${env.RATE_LIMIT_SALT ?? "waydidi-checkout"}:${address}:${agent}`,
    );
    const rateWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const [{ attempts }] = await getDb()
      .select({ attempts: count() })
      .from(checkoutAttempts)
      .where(
        and(
          eq(checkoutAttempts.fingerprintHash, fingerprint),
          gt(checkoutAttempts.createdAt, rateWindow),
        ),
      );
    if (attempts >= 8)
      return NextResponse.json(
        {
          error:
            "Too many payment attempts. Please wait 15 minutes and try again.",
        },
        { status: 429, headers: { "Retry-After": "900" } },
      );
    await getDb()
      .insert(checkoutAttempts)
      .values({
        fingerprintHash: fingerprint,
        createdAt: new Date().toISOString(),
      });
    await getDb()
      .delete(checkoutAttempts)
      .where(
        lt(
          checkoutAttempts.createdAt,
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        ),
      );
    const input = (await request.json()) as Payload;
    if (!valid(input))
      return NextResponse.json(
        { error: "Check your booking details and try again." },
        { status: 400 },
      );
    const staleCutoff = new Date(
      Date.now() - 24 * 60 * 60 * 1000,
    ).toISOString();
    await getDb()
      .delete(bookings)
      .where(
        and(
          eq(bookings.status, "pending_payment"),
          lt(bookings.createdAt, staleCutoff),
        ),
      );
    const selected = VEHICLES[input.vehicle];
    let total: number = selected.total;
    let quoteData: {
      id: string;
      pickupText: string;
      dropoffText: string;
      areaName: string;
      distanceMeters: number;
      durationSeconds: number;
      pricingVersion: number;
      basePrice: number;
      distanceSurcharge: number;
      pickupLatitude: number | null;
      pickupLongitude: number | null;
      dropoffLatitude: number | null;
      dropoffLongitude: number | null;
    } | null = null;
    let hourlyData: { id:string;pickupText:string;areaName:string;bookedHours:number;pricingVersion:number;basePrice:number;includedDistanceMeters:number;extraHourRate:number;extraDistanceRate:number;pickupLatitude:number|null;pickupLongitude:number|null } | null = null;
    if (input.serviceType === "hourly") {
      const [quote] = await getDb().select().from(hourlyQuotes).where(eq(hourlyQuotes.id,input.hourlyQuoteId!)).limit(1);
      if (!quote || new Date(quote.expiresAt).getTime() <= Date.now() || quote.bookedHours !== input.bookedHours) return NextResponse.json({error:"Your hourly price expired. Please search again."},{status:409});
      const prices=JSON.parse(quote.vehiclePricesJson) as Record<string,{total:number;basePrice:number;includedDistanceMeters:number;extraHourRate:number;extraDistanceRate:number}>;
      const price=prices[input.vehicle];
      if (!price || !Number.isInteger(price.total)) return NextResponse.json({error:"This vehicle is unavailable for hourly booking."},{status:409});
      total=price.total;
      hourlyData={id:quote.id,pickupText:quote.pickupText,areaName:quote.areaName,bookedHours:quote.bookedHours,pricingVersion:quote.pricingVersion,basePrice:price.basePrice,includedDistanceMeters:price.includedDistanceMeters,extraHourRate:price.extraHourRate,extraDistanceRate:price.extraDistanceRate,pickupLatitude:quote.pickupLatitude,pickupLongitude:quote.pickupLongitude};
    }
    if (input.serviceType !== "hourly" && input.fareQuoteId) {
      const [quote] = await getDb()
        .select()
        .from(fareQuotes)
        .where(eq(fareQuotes.id, input.fareQuoteId))
        .limit(1);
      if (!quote || new Date(quote.expiresAt).getTime() <= Date.now())
        return NextResponse.json(
          {
            error:
              "Your route price expired. Please calculate the route again.",
          },
          { status: 409 },
        );
      const prices = JSON.parse(quote.vehiclePricesJson) as Record<
        string,
        { total: number; basePrice: number; distanceSurcharge: number }
      >;
      const price = prices[input.vehicle];
      if (!price || !Number.isInteger(price.total))
        return NextResponse.json(
          { error: "This vehicle is unavailable for the selected area." },
          { status: 409 },
        );
      total = price.total;
      quoteData = {
        id: quote.id,
        pickupText: quote.pickupText,
        dropoffText: quote.dropoffText,
        areaName: quote.areaName,
        distanceMeters: quote.distanceMeters,
        durationSeconds: quote.durationSeconds,
        pricingVersion: quote.pricingVersion,
        basePrice: price.basePrice,
        distanceSurcharge: price.distanceSurcharge,
        pickupLatitude: quote.pickupLatitude,
        pickupLongitude: quote.pickupLongitude,
        dropoffLatitude: quote.dropoffLatitude,
        dropoffLongitude: quote.dropoffLongitude,
      };
    }
    if (input.passengers > selected.capacity) {
      return NextResponse.json(
        { error: "This vehicle is too small for your group." },
        { status: 400 },
      );
    }
    if (input.luggage > selected.luggageCapacity) {
      return NextResponse.json(
        {
          error: `This vehicle accepts up to ${selected.luggageCapacity} luggage items.`,
        },
        { status: 400 },
      );
    }
    const reference = `WD-${crypto.randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
    createdReference = reference;
    const accessToken = secureToken();
    const now = new Date().toISOString();
    await getDb()
      .insert(bookings)
      .values({
        reference,
        customerName: input.customerName.trim(),
        customerEmail: input.customerEmail.trim().toLowerCase(),
        customerPhone: input.customerPhone.trim(),
        pickup: hourlyData?.pickupText ?? quoteData?.pickupText ?? input.pickup.trim(),
        dropoff: input.serviceType === "hourly" ? "Flexible itinerary — hourly service" : quoteData?.dropoffText ?? input.dropoff.trim(),
        pickupDate: input.pickupDate,
        pickupTime: input.pickupTime,
        passengers: input.passengers,
        luggage: input.luggage,
        flightNumber: input.flightNumber?.trim() || null,
        pickupSign: input.pickupSign?.trim() || null,
        pickupInstructions: input.pickupInstructions?.trim() || null,
        childSeats: input.childSeats,
        oversizedLuggage: input.oversizedLuggage,
        specialRequests: input.specialRequests?.trim() || null,
        vehicle: selected.name,
        paymentMethod: input.paymentMethod === "cash" ? "cash" : "stripe",
        total,
        status: "pending_payment",
        termsAcceptedAt: now,
        policyVersion: POLICY_VERSION,
        accessTokenHash: await sha256(accessToken),
        emailStatus: "pending",
        createdAt: now,
        updatedAt: now,
        fareQuoteId: quoteData?.id,
        pricingArea: hourlyData?.areaName ?? quoteData?.areaName,
        routeDistanceMeters: quoteData?.distanceMeters,
        routeDurationSeconds: quoteData?.durationSeconds,
        pickupLatitude: hourlyData?.pickupLatitude ?? quoteData?.pickupLatitude,
        pickupLongitude: hourlyData?.pickupLongitude ?? quoteData?.pickupLongitude,
        dropoffLatitude: quoteData?.dropoffLatitude,
        dropoffLongitude: quoteData?.dropoffLongitude,
        basePrice: hourlyData?.basePrice ?? quoteData?.basePrice,
        distanceSurcharge: quoteData?.distanceSurcharge,
        pricingVersion: hourlyData?.pricingVersion ?? quoteData?.pricingVersion,
        serviceType: input.serviceType === "hourly" ? "hourly" : "transfer",
        bookedHours: hourlyData?.bookedHours,
        scheduledEndAt: hourlyData ? new Date(new Date(`${input.pickupDate}T${input.pickupTime}:00+07:00`).getTime()+hourlyData.bookedHours*3600000).toISOString() : null,
        hourlyQuoteId: hourlyData?.id,
        includedDistanceMeters: hourlyData?.includedDistanceMeters,
        extraHourRate: hourlyData?.extraHourRate,
        extraDistanceRate: hourlyData?.extraDistanceRate,
      });
    if (input.paymentMethod === "cash") {
      const [cashBooking] = await getDb()
        .select()
        .from(bookings)
        .where(eq(bookings.reference, reference))
        .limit(1);
      await getDb()
        .insert(bookingEvents)
        .values({
          bookingReference: reference,
          eventType: "cash_booking_created",
          providerEventId: `cash:${reference}`,
          createdAt: now,
        });
      await fulfillBooking(cashBooking);
      return NextResponse.json({
        checkoutUrl: `${safeOrigin(request)}/booking/confirmation/${reference}?token=${accessToken}`,
      });
    }
    const session = await createCheckoutSession({
      reference,
      accessToken,
      customerEmail: input.customerEmail.trim().toLowerCase(),
      vehicle: input.vehicle,
      origin: safeOrigin(request),
      total,
    });
    await getDb()
      .update(bookings)
      .set({
        checkoutSessionId: session.id,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(bookings.reference, reference));
    await getDb()
      .insert(bookingEvents)
      .values({
        bookingReference: reference,
        eventType: "checkout_created",
        providerEventId: `checkout:${session.id}`,
        createdAt: new Date().toISOString(),
      });
    return NextResponse.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error("Checkout creation failed", error);
    if (createdReference)
      await getDb()
        .delete(bookings)
        .where(
          and(
            eq(bookings.reference, createdReference),
            eq(bookings.status, "pending_payment"),
          ),
        )
        .catch(() => undefined);
    const message =
      error instanceof Error && error.message === "STRIPE_NOT_CONFIGURED"
        ? "Stripe test mode is not configured yet."
        : "Payment checkout could not start. Please try again.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
