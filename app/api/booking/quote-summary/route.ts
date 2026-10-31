import { env } from "cloudflare:workers";
import { priceRouteStops } from "@/lib/route-stops-db";
import { RouteStopSelectionError, stopDurationMinutes, stopTotalMinor, type RouteStopSnapshot } from "@/lib/route-stops";
import { cancellationConfig, cancellationFareMinor, resolveCancellationOption } from "@/lib/cancellation-options";
import { toSatang } from "@/lib/money";
import { serviceStartMs } from "@/lib/refund-policy";
import { validTransferQuote } from "@/lib/quote-validity";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { fareQuotes } from "@/db/schema";
import { bangkokDepartureTimestamp } from "@/lib/booking-time";
import { quoteSummaryInputSchema, validationError } from "@/lib/booking-validation";
import { VEHICLE_IDS } from "@/lib/pricing";
import { isJsonRequest, sameOrigin } from "@/lib/security";

type StoredPrice = {
  total: number;
  basePrice: number;
  distanceSurcharge: number;
};

function pricesFromQuote(value: string) {
  try {
    const parsed = JSON.parse(value) as Record<string, StoredPrice>;
    return Object.fromEntries(
      VEHICLE_IDS.flatMap((vehicleId) => {
        const price = parsed[vehicleId];
        return price && Number.isFinite(price.total) && price.total >= 0
          ? [[vehicleId, price] as const]
          : [];
      }),
    );
  } catch {
    return {} as Record<string, StoredPrice>;
  }
}

function journey(quote: typeof fareQuotes.$inferSelect) {
  return {
    quoteId: quote.id,
    pickup: quote.pickupText,
    dropoff: quote.dropoffText,
    departureDate: quote.departureDate,
    departureTime: quote.departureTime,
    timezone: quote.timezone,
    distanceMeters: quote.distanceMeters,
    durationSeconds: quote.durationSeconds,
  };
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !isJsonRequest(request)) {
    return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  }

  const parsed = quoteSummaryInputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(validationError(parsed), { status: 400 });
  }

  const outbound = await getDb().query.fareQuotes.findFirst({
    where: eq(fareQuotes.id, parsed.data.outboundQuoteId),
  });
  if (!outbound) {
    return NextResponse.json(
      { error: "The outbound journey could not be found. Please calculate it again." },
      { status: 404 },
    );
  }

  const returnQuote = parsed.data.returnQuoteId
    ? await getDb().query.fareQuotes.findFirst({
        where: eq(fareQuotes.id, parsed.data.returnQuoteId),
      })
    : null;
  if (parsed.data.returnQuoteId && !returnQuote) {
    return NextResponse.json(
      { error: "The return journey could not be found. Please calculate it again." },
      { status: 404 },
    );
  }

  if(!validTransferQuote(outbound)||(returnQuote&&!validTransferQuote(returnQuote))) return NextResponse.json({error:"A journey quote expired. Calculate both routes again."},{status:409});
  if (returnQuote) {
    const directionMatches =
      returnQuote.pickupPlaceId === outbound.dropoffPlaceId &&
      returnQuote.dropoffPlaceId === outbound.pickupPlaceId;
    const outboundTime = bangkokDepartureTimestamp(
      outbound.departureDate ?? "",
      outbound.departureTime ?? "",
    );
    const returnTime = bangkokDepartureTimestamp(
      returnQuote.departureDate ?? "",
      returnQuote.departureTime ?? "",
    );
    if (!directionMatches) {
      return NextResponse.json(
        { error: "The return journey must reverse the outbound pickup and destination." },
        { status: 409 },
      );
    }
    if (outboundTime === null || returnTime === null || returnTime <= outboundTime) {
      return NextResponse.json(
        { error: "Choose a return date and time after your departure." },
        { status: 409 },
      );
    }
  }

  let routeStops: RouteStopSnapshot[];
  try {
    routeStops = await priceRouteStops(parsed.data.routeStopIds, outbound, (env as unknown as Record<string, unknown>).ROUTE_STOPS === "1");
  } catch (error) {
    if (!(error instanceof RouteStopSelectionError)) throw error;
    return NextResponse.json({ code: error.message, error: "Your selected sightseeing stops are unavailable. Please review your journey." }, { status: 409 });
  }
  const routeStopsTotalMinor = stopTotalMinor(routeStops);
  const config = cancellationConfig(env as unknown as Record<string, unknown>);
  let option;
  try {
    option = resolveCancellationOption(parsed.data.cancellationOption, config, (serviceStartMs(outbound.departureDate!, outbound.departureTime!) - Date.now()) / 3600000, parsed.data.paymentMethod);
  } catch {
    return NextResponse.json({ error: "Choose an available cancellation option." }, { status: 400 });
  }
  const outboundPrices = pricesFromQuote(outbound.vehiclePricesJson);
  const returnPrices = returnQuote
    ? pricesFromQuote(returnQuote.vehiclePricesJson)
    : {};
  const prices = Object.fromEntries(
    VEHICLE_IDS.flatMap((vehicleId) => {
      const outboundPrice = outboundPrices[vehicleId]?.total;
      const returnPrice = returnQuote ? returnPrices[vehicleId]?.total : 0;
      if (!Number.isFinite(outboundPrice) || !Number.isFinite(returnPrice)) return [];
      return [[vehicleId, {
        outbound: outboundPrice,
        return: returnPrice,
        total: ((config.enabled ? cancellationFareMinor(toSatang(outboundPrice) + toSatang(returnPrice), option, config) : toSatang(outboundPrice) + toSatang(returnPrice)) + routeStopsTotalMinor) / 100,
      }] as const];
    }),
  );

  if (Object.keys(prices).length === 0) {
    return NextResponse.json(
      { error: "No matching vehicle prices are available for this journey." },
      { status: 422 },
    );
  }

  return NextResponse.json({
    currency: "THB",
    outbound: { ...journey(outbound), durationSeconds: outbound.durationSeconds + stopDurationMinutes(routeStops) * 60 },
    return: returnQuote ? journey(returnQuote) : null,
    prices,
    routeStops,
    routeStopsTotalMinor,
  });
}
