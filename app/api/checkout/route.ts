import { NextResponse } from "next/server";
import { customerFromRequest } from "@/lib/customer-auth";
import { bookingContacts, bookingFreeAddons, bookingMemberDiscounts, bookingSources, bookingTaxInvoices, customerBillingProfiles, customerBookingLinks, promoRedemptions } from "@/db/schema";
import { and as andWhere, eq as eqWhere } from "drizzle-orm";
import { normalizeCode } from "@/lib/promo";
import { checkPromo, normalizePhone } from "@/lib/promo-db";
import { claimGift, freeAddonsWithGifts, listMemberGifts, releaseGifts } from "@/lib/gifts";
import { isAirportPickup } from "@/lib/waiting-policy";
import { memberTierStatus, tierDiscount, tierFreeAddons, TIERS, type Tier } from "@/lib/member-tier";
import { addonsTotal } from "@/lib/addons";
import { loadInclusions } from "@/lib/route-inclusions-db";
import { and, count, eq, gt, lt } from "drizzle-orm";
import { env } from "cloudflare:workers";
import { getDb } from "@/db";
import {
  bookingEvents,
  bookingPayments,
  bookings,
  checkoutAttempts,
  fareQuotes,
  hourlyQuotes,
} from "@/db/schema";
import { paymentProviderFor } from "@/lib/payments/provider";
import { VEHICLES, vehicleFits } from "@/lib/vehicles";
import { fulfillBooking } from "@/lib/booking-fulfillment";
import { checkoutInputSchema, validationError, type CheckoutInput } from "@/lib/booking-validation";
import { tripPinForReference, tripPinHash } from "@/lib/trip-pin";
import { uniqueBookingReference } from "@/lib/booking-reference-server";
import { bangkokDepartureTimestamp } from "@/lib/booking-time";
import {
  isJsonRequest,
  safeOrigin,
  sameOrigin,
  sha256,
  hmacSha256,
} from "@/lib/security";
import { logOperationalError, monitoredHeaders, requestIdFor } from "@/lib/observability";
import { lookupFlight, type FlightSnapshot } from "@/lib/aviationstack";
import { expireAbandonedCheckouts } from "@/lib/booking-expiry";

const POLICY_VERSION = "2026-09-07";

type StoredBooking = typeof bookings.$inferSelect;

function checkoutSecret() {
  return env.RATE_LIMIT_SALT || env.WAYDIDI_ADMIN_SESSION_SECRET || env.STRIPE_SECRET_KEY || "";
}

async function accessTokenForAttempt(attemptId: string) {
  const secret = checkoutSecret();
  if (!secret) throw new Error("CHECKOUT_SECURITY_NOT_CONFIGURED");
  return hmacSha256(secret, `waydidi-checkout:${attemptId}`);
}

async function existingCheckoutResponse(
  request: Request,
  booking: StoredBooking,
  accessToken: string,
  input?: CheckoutInput | null,
) {
  const confirmationUrl = `${safeOrigin(request)}/booking/confirmation/${booking.reference}?token=${accessToken}`;
  if (booking.status !== "pending_payment") {
    return NextResponse.json({ checkoutUrl: confirmationUrl, reused: true });
  }
  if (booking.paymentMethod === "cash") {
    await fulfillBooking(booking);
    return NextResponse.json({ checkoutUrl: confirmationUrl, reused: true });
  }
  if (!booking.checkoutSessionId) {
    if (!input || !booking.checkoutAttemptHash) {
      return NextResponse.json(
        { code: "CHECKOUT_IN_PROGRESS", error: "Checkout is still starting. Please try again in a moment.", retryable: true },
        { status: 409, headers: { "Retry-After": "2" } },
      );
    }
    const session = await paymentProviderFor("stripe").createPayment({
      reference: booking.reference,
      accessToken,
      customerEmail: booking.customerEmail,
      vehicle: input.vehicle,
      origin: safeOrigin(request),
      total: booking.total,
      idempotencyKey: booking.checkoutAttemptHash,
    });
    if (!session.sessionId || !session.checkoutUrl) throw new Error("PROVIDER_SESSION_INVALID");
    await getDb().update(bookings).set({
      checkoutSessionId: session.sessionId,
      updatedAt: new Date().toISOString(),
    }).where(eq(bookings.reference, booking.reference));
    await getDb().update(bookingPayments).set({ providerSessionId: session.sessionId, updatedAt: new Date().toISOString() }).where(eq(bookingPayments.id, `primary:${booking.reference}`));
    await getDb().insert(bookingEvents).values({
      bookingReference: booking.reference,
      eventType: "checkout_recovered",
      providerEventId: `checkout:${session.sessionId}`,
      createdAt: new Date().toISOString(),
    }).onConflictDoNothing();
    return NextResponse.json({ checkoutUrl: session.checkoutUrl, reused: true });
  }
  try {
    const session = await paymentProviderFor("stripe").retrievePayment(booking.checkoutSessionId);
    if (session.checkoutUrl) return NextResponse.json({ checkoutUrl: session.checkoutUrl, reused: true });
    if (session.status === "paid") {
      return NextResponse.json({ checkoutUrl: confirmationUrl, reused: true });
    }
  } catch (error) {
    console.error("Existing checkout recovery failed", error);
  }
  return NextResponse.json(
    { code: "CHECKOUT_RECOVERY_FAILED", error: "We could not reopen the payment page. Please try again shortly.", retryable: true },
    { status: 503 },
  );
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const requestId = requestIdFor(request);
  let attemptHash = "";
  let payloadHash = "";
  let recoveryToken = "";
  let checkoutInput: CheckoutInput | null = null;
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
    const parsed = checkoutInputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(validationError(parsed), { status: 400 });
    const input: CheckoutInput = parsed.data;
    checkoutInput = input;
    attemptHash = await sha256(`checkout-attempt:${input.checkoutAttemptId}`);
    payloadHash = await sha256(JSON.stringify(input));
    recoveryToken = await accessTokenForAttempt(input.checkoutAttemptId);
    const [existingAttempt] = await getDb()
      .select()
      .from(bookings)
      .where(eq(bookings.checkoutAttemptHash, attemptHash))
      .limit(1);
    if (existingAttempt) {
      if (existingAttempt.checkoutPayloadHash !== payloadHash) {
        return NextResponse.json(
          { code: "IDEMPOTENCY_CONFLICT", error: "Your booking details changed. Please review them and try again.", retryable: false },
          { status: 409 },
        );
      }
      return existingCheckoutResponse(request, existingAttempt, recoveryToken, input);
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
          code: "RATE_LIMITED",
          error:
            "Too many payment attempts. Please wait 15 minutes and try again.",
          retryable: true,
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
    await expireAbandonedCheckouts();
    const selected = VEHICLES[input.vehicle];
    if (!vehicleFits(input.vehicle, input.passengers, input.luggage)) {
      return NextResponse.json(
        {
          code: "VEHICLE_TOO_SMALL",
          error: `The ${selected.name} carries up to ${selected.passengers} passengers and ${selected.bags} bags. Choose a larger vehicle.`,
          field: "vehicle",
          retryable: false,
        },
        { status: 400 },
      );
    }
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
      routePolyline: string | null;
      total: number;
      pickupPlaceId: string;
      dropoffPlaceId: string;
    } | null = null;
    let returnData: {
      id: string;
      pickupText: string;
      dropoffText: string;
      distanceMeters: number;
      durationSeconds: number;
      routePolyline: string | null;
      total: number;
    } | null = null;
    let hourlyData: { id:string;pickupText:string;areaName:string;bookedHours:number;pricingVersion:number;basePrice:number;includedDistanceMeters:number;extraHourRate:number;extraDistanceRate:number;pickupLatitude:number|null;pickupLongitude:number|null } | null = null;
    if (input.serviceType === "hourly") {
      const [quote] = await getDb().select().from(hourlyQuotes).where(eq(hourlyQuotes.id,input.hourlyQuoteId!)).limit(1);
      if (!quote || quote.bookedHours !== input.bookedHours || quote.departureDate !== input.pickupDate || quote.departureTime !== input.pickupTime || quote.timezone !== input.timezone) return NextResponse.json({code:"QUOTE_MISMATCH",error:"Your hourly booking details changed. Please calculate the price again.",field:"hourlyQuoteId",retryable:true},{status:409});
      const prices=JSON.parse(quote.vehiclePricesJson) as Record<string,{total:number;basePrice:number;includedDistanceMeters:number;extraHourRate:number;extraDistanceRate:number}>;
      const price=prices[input.vehicle];
      if (!price || !Number.isInteger(price.total)) return NextResponse.json({error:"This vehicle is unavailable for hourly booking."},{status:409});
      total=price.total;
      hourlyData={id:quote.id,pickupText:quote.pickupText,areaName:quote.areaName,bookedHours:quote.bookedHours,pricingVersion:quote.pricingVersion,basePrice:price.basePrice,includedDistanceMeters:price.includedDistanceMeters,extraHourRate:price.extraHourRate,extraDistanceRate:price.extraDistanceRate,pickupLatitude:quote.pickupLatitude,pickupLongitude:quote.pickupLongitude};
    }
    if (input.serviceType !== "hourly") {
      const [quote] = await getDb()
        .select()
        .from(fareQuotes)
        .where(eq(fareQuotes.id, input.fareQuoteId!))
        .limit(1);
      if (!quote)
        return NextResponse.json(
          {
            error: "Your route price is unavailable. Please calculate the route again.",
          },
          { status: 409 },
        );
      if (quote.departureDate !== input.pickupDate || quote.departureTime !== input.pickupTime || quote.timezone !== input.timezone)
        return NextResponse.json({code:"QUOTE_MISMATCH",error:"Your journey date or time changed. Please calculate the route again.",field:"fareQuoteId",retryable:true},{status:409});
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
        routePolyline: quote.routePolyline,
        total: price.total,
        pickupPlaceId: quote.pickupPlaceId,
        dropoffPlaceId: quote.dropoffPlaceId,
      };
      if (input.returnFareQuoteId) {
        const [returnQuote] = await getDb()
          .select()
          .from(fareQuotes)
          .where(eq(fareQuotes.id, input.returnFareQuoteId))
          .limit(1);
        if (!returnQuote)
          return NextResponse.json(
            { code: "RETURN_QUOTE_MISSING", error: "Your return price is unavailable. Please calculate it again.", field: "returnFareQuoteId", retryable: true },
            { status: 409 },
          );
        const reversed =
          returnQuote.pickupPlaceId === quote.dropoffPlaceId &&
          returnQuote.dropoffPlaceId === quote.pickupPlaceId;
        const outboundDeparture = bangkokDepartureTimestamp(input.pickupDate, input.pickupTime);
        const returnDeparture = bangkokDepartureTimestamp(input.returnDate!, input.returnTime!);
        if (
          !reversed ||
          returnQuote.departureDate !== input.returnDate ||
          returnQuote.departureTime !== input.returnTime ||
          returnQuote.timezone !== input.timezone ||
          outboundDeparture === null ||
          returnDeparture === null ||
          returnDeparture <= outboundDeparture
        )
          return NextResponse.json(
            { code: "RETURN_QUOTE_MISMATCH", error: "Your return journey changed. Please calculate both journeys again.", field: "returnFareQuoteId", retryable: true },
            { status: 409 },
          );
        const returnPrices = JSON.parse(returnQuote.vehiclePricesJson) as Record<
          string,
          { total: number; basePrice: number; distanceSurcharge: number }
        >;
        const returnPrice = returnPrices[input.vehicle];
        if (!returnPrice || !Number.isInteger(returnPrice.total))
          return NextResponse.json(
            { error: "This vehicle is unavailable for the return journey." },
            { status: 409 },
          );
        returnData = {
          id: returnQuote.id,
          pickupText: returnQuote.pickupText,
          dropoffText: returnQuote.dropoffText,
          distanceMeters: returnQuote.distanceMeters,
          durationSeconds: returnQuote.durationSeconds,
          routePolyline: returnQuote.routePolyline,
          total: returnPrice.total,
        };
        total = price.total + returnPrice.total;
      }
    }
    // Promo code: checked here against the real quote price; the browser's
    // preview is never trusted.
    const account = await customerFromRequest(request);
    let promoApplied: { promoId: string; code: string; originalTotal: number; discount: number } | null = null;
    if (input.promoCode) {
      const result = await checkPromo({
        code: normalizeCode(input.promoCode),
        total,
        serviceType: input.serviceType === "hourly" ? "hourly" : "transfer",
        returnTrip: Boolean(input.returnFareQuoteId),
        vehicle: input.vehicle,
        email: input.customerEmail,
        phone: input.customerPhone,
        customerId: account?.customer.id ?? null,
        airportTrip: isAirportPickup(input.pickup) || isAirportPickup(input.dropoff),
      });
      if (!result.ok || !result.promo)
        return NextResponse.json(
          { code: "PROMO_INVALID", error: result.ok ? "This promo code isn't valid." : result.reason, field: "promoCode" },
          { status: 409 },
        );
      promoApplied = { promoId: result.promo.id, code: result.promo.code, originalTotal: total, discount: result.discount };
      total = result.finalTotal;
    }
    // Member tier discount: automatic for signed-in members, taken from the fare
    // left after any promo code (so both apply).
    let memberApplied: { tier: string; percent: number; discount: number } | null = null;
    let memberTier: Tier | null = null;
    if (account) {
      const { tier } = await memberTierStatus(account.customer.id).catch(() => ({ tier: TIERS[0] }));
      memberTier = tier;
      const amount = tierDiscount(tier, total);
      if (amount > 0) { memberApplied = { tier: tier.id, percent: tier.percent, discount: amount }; total -= amount; }
    }
    // Add-ons are charged on top of the fare and are not discounted by promo codes.
    // Diamond and Platinum members get some add-ons free.
    // Then one child-seat / exchange-stop gift voucher each, if the member has them.
    const gifts = account ? await listMemberGifts(account.customer.id).catch(() => []) : [];
    const voucher = (id: string) => gifts.find((g) => g.giftId === id && g.status === "available") ?? null;
    const freeAddons = freeAddonsWithGifts(tierFreeAddons(memberTier, input.childSeats, input.exchangeStop), input.childSeats, input.exchangeStop, { childSeat: Boolean(voucher("child_seat")), exchangeStop: Boolean(voucher("exchange_stop")) });
    // Ferry & hotel transfer: only on Koh Kood / Koh Mak transfers, checked against the quoted route.
    let ferryHotel = false;
    if (input.ferryHotel) {
      const offered = input.serviceType !== "hourly" && quoteData && quoteData.pickupLatitude != null && quoteData.pickupLongitude != null && quoteData.dropoffLatitude != null && quoteData.dropoffLongitude != null
        ? (await loadInclusions({ lat: quoteData.pickupLatitude, lng: quoteData.pickupLongitude }, { lat: quoteData.dropoffLatitude, lng: quoteData.dropoffLongitude })).hotelTransfer
        : false;
      if (!offered) return NextResponse.json({ code: "ADDON_UNAVAILABLE", error: "Ferry & hotel transfer is only available to Koh Kood and Koh Mak.", field: "ferryHotel", retryable: false }, { status: 409 });
      ferryHotel = true;
    }
    total += addonsTotal(input.childSeats, input.exchangeStop, freeAddons, ferryHotel ? input.passengers : 0);
    // Nothing to pay (e.g. a free transfer gift with no add-ons): no card payment needed.
    if (total <= 0) { total = 0; input.paymentMethod = "cash"; }
    const reference = await uniqueBookingReference();
    // Claim every gift this booking uses before saving it, so a second tab or device
    // can't use the same gift at the same time.
    const giftIds = [
      ...freeAddons.usedGifts.map((id) => voucher(id)?.id).filter((id): id is string => Boolean(id)),
      ...(promoApplied?.promoId.startsWith("gift:") ? [promoApplied.promoId.slice(5)] : []),
    ];
    for (const giftId of giftIds) {
      if (!(await claimGift(giftId, reference))) {
        await releaseGifts(reference);
        return NextResponse.json(
          { code: "GIFT_UNAVAILABLE", error: "One of your gifts was just used on another booking. Please check your price and try again.", field: "promoCode", retryable: true },
          { status: 409 },
        );
      }
    }
    const accessToken = recoveryToken;
    const now = new Date().toISOString();
    const tripPin = await tripPinForReference(reference);
    let flight: FlightSnapshot | null = null;
    if (input.flightNumber?.trim()) {
      try { flight = await lookupFlight(input.flightNumber, input.pickupDate); }
      catch { /* Flight data is helpful, but never blocks a valid booking. */ }
    }
    await getDb()
      .insert(bookings)
      .values({
        reference,
        customerName: `${input.customerName.trim()} ${input.customerSurname.trim()}`,
        customerSurname: input.customerSurname.trim(),
        customerEmail: input.customerEmail.trim().toLowerCase(),
        customerPhone: input.customerPhone.trim(),
        pickup: hourlyData?.pickupText ?? quoteData?.pickupText ?? input.pickup.trim(),
        dropoff: input.serviceType === "hourly" ? "Flexible itinerary — hourly service" : quoteData?.dropoffText ?? input.dropoff.trim(),
        pickupDate: input.pickupDate,
        pickupTime: input.pickupTime,
        passengers: input.passengers,
        luggage: input.luggage,
        flightNumber: input.flightNumber?.trim() || null,
        flightStatus: flight?.status ?? null,
        flightAirline: flight?.airline ?? null,
        flightDepartureAirport: flight?.departureAirport ?? null,
        flightArrivalAirport: flight?.arrivalAirport ?? null,
        flightScheduledArrival: flight?.scheduledArrival ?? null,
        flightEstimatedArrival: flight?.estimatedArrival ?? null,
        flightLastCheckedAt: flight?.checkedAt ?? null,
        pickupSign: input.pickupSign?.trim() || null,
        pickupInstructions: input.pickupInstructions?.trim() || null,
        childSeats: input.childSeats,
        oversizedLuggage: input.oversizedLuggage,
        specialRequests: input.specialRequests?.trim() || null,
        vehicle: selected.name,
        paymentMethod: input.paymentMethod === "cash" ? "cash" : "stripe",
        total,
        status: "pending_payment",
        paymentStatus: input.paymentMethod === "cash" ? "cash_due" : "pending",
        paymentStatusUpdatedAt: now,
        reconciliationStatus: input.paymentMethod === "cash" ? "not_required" : "pending",
        checkoutAttemptHash: attemptHash,
        checkoutPayloadHash: payloadHash,
        termsAcceptedAt: now,
        policyVersion: POLICY_VERSION,
        accessTokenHash: await sha256(accessToken),
        tripPinHash: await tripPinHash(reference, tripPin),
        tripPinCreatedAt: now,
        emailStatus: "pending",
        createdAt: now,
        updatedAt: now,
        fareQuoteId: quoteData?.id,
        returnFareQuoteId: returnData?.id,
        returnPickup: returnData?.pickupText,
        returnDropoff: returnData?.dropoffText,
        returnDate: returnData ? input.returnDate : null,
        returnTime: returnData ? input.returnTime : null,
        outboundTotal: quoteData?.total,
        returnTotal: returnData?.total,
        returnDistanceMeters: returnData?.distanceMeters,
        returnDurationSeconds: returnData?.durationSeconds,
        returnRoutePolyline: returnData?.routePolyline,
        pricingArea: hourlyData?.areaName ?? quoteData?.areaName,
        routeDistanceMeters: quoteData?.distanceMeters,
        routeDurationSeconds: quoteData?.durationSeconds,
        expectedRoutePolyline: quoteData?.routePolyline,
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
    // Bookings made while signed in are linked to the customer's account,
    // even when booked for someone else's email.
    if (promoApplied) await getDb().insert(promoRedemptions).values({
      id: crypto.randomUUID(),
      promoId: promoApplied.promoId,
      code: promoApplied.code,
      bookingReference: reference,
      customerEmail: input.customerEmail.trim().toLowerCase(),
      customerPhone: normalizePhone(input.customerPhone),
      customerId: account?.customer.id ?? null,
      originalTotal: promoApplied.originalTotal,
      discount: promoApplied.discount,
      finalTotal: total,
      createdAt: now,
    }).onConflictDoNothing();
    // Copies of the booking emails: an address the customer typed, and the signed-in
    // booker when the ride is for someone else.
    const leadEmail = input.customerEmail.trim().toLowerCase();
    const contacts = new Map<string, "booker" | "copy">();
    if (input.copyEmail && input.copyEmail.toLowerCase() !== leadEmail) contacts.set(input.copyEmail.toLowerCase(), "copy");
    if (account && account.customer.email.toLowerCase() !== leadEmail) contacts.set(account.customer.email.toLowerCase(), "booker");
    if (contacts.size) await getDb().insert(bookingContacts).values([...contacts].map(([email, role]) => ({ id: crypto.randomUUID(), bookingReference: reference, email, role, createdAt: now }))).onConflictDoNothing().catch(() => undefined);
    if (input.taxInvoice) await getDb().insert(bookingTaxInvoices).values({
      id: crypto.randomUUID(),
      bookingReference: reference,
      name: input.taxInvoice.name,
      taxId: input.taxInvoice.taxId,
      branch: input.taxInvoice.branch || "Head office",
      address: input.taxInvoice.address,
      createdAt: now,
    }).onConflictDoNothing();
    // "Save to my account": keep these billing details for next time (once per tax ID + name).
    if (input.taxInvoice && input.saveBilling && account) {
      const tax = input.taxInvoice;
      const [existing] = await getDb().select({ id: customerBillingProfiles.id }).from(customerBillingProfiles)
        .where(andWhere(eqWhere(customerBillingProfiles.customerId, account.customer.id), eqWhere(customerBillingProfiles.taxId, tax.taxId), eqWhere(customerBillingProfiles.name, tax.name))).limit(1).catch(() => []);
      if (!existing) await getDb().insert(customerBillingProfiles).values({ id: crypto.randomUUID(), customerId: account.customer.id, name: tax.name, taxId: tax.taxId, branch: tax.branch || "Head office", address: tax.address, createdAt: now, updatedAt: now }).catch(() => undefined);
    }
    if (freeAddons.childSeats > 0 || freeAddons.exchangeStop) await getDb().insert(bookingFreeAddons).values({ bookingReference: reference, tier: `${memberTier?.id ?? "bronze"}${freeAddons.usedGifts.length ? "+gift" : ""}`, childSeats: freeAddons.childSeats, exchangeStop: freeAddons.exchangeStop, createdAt: now }).onConflictDoNothing();
    if (memberApplied && account) await getDb().insert(bookingMemberDiscounts).values({ bookingReference: reference, customerId: account.customer.id, ...memberApplied, createdAt: now }).onConflictDoNothing();
    if (input.source) await getDb().insert(bookingSources).values({ bookingReference: reference, source: input.source, createdAt: now }).onConflictDoNothing().catch(() => undefined);
    if (account) await getDb().insert(customerBookingLinks).values({ bookingReference: reference, customerId: account.customer.id, createdAt: now }).onConflictDoNothing();
    await getDb().insert(bookingPayments).values({
      id: `primary:${reference}`,
      bookingReference: reference,
      provider: input.paymentMethod === "cash" ? "cash" : "stripe",
      status: input.paymentMethod === "cash" ? "cash_due" : "pending",
      providerStatus: input.paymentMethod === "cash" ? "cash_due" : "pending",
      amountExpected: total,
      reconciliationStatus: input.paymentMethod === "cash" ? "not_required" : "pending",
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
    if (input.paymentMethod === "cash") {
      await paymentProviderFor("cash").createPayment({
        reference,
        accessToken,
        customerEmail: input.customerEmail.trim().toLowerCase(),
        vehicle: input.vehicle,
        origin: safeOrigin(request),
        total,
        idempotencyKey: attemptHash,
      });
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
    const session = await paymentProviderFor("stripe").createPayment({
      reference,
      accessToken,
      customerEmail: input.customerEmail.trim().toLowerCase(),
      vehicle: input.vehicle,
      origin: safeOrigin(request),
      total,
      idempotencyKey: attemptHash,
    });
    if (!session.sessionId || !session.checkoutUrl) throw new Error("PROVIDER_SESSION_INVALID");
    await getDb()
      .update(bookings)
      .set({
        checkoutSessionId: session.sessionId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(bookings.reference, reference));
    await getDb().update(bookingPayments).set({ providerSessionId: session.sessionId, updatedAt: new Date().toISOString() }).where(eq(bookingPayments.id, `primary:${reference}`));
    await getDb()
      .insert(bookingEvents)
      .values({
        bookingReference: reference,
        eventType: "checkout_created",
        providerEventId: `checkout:${session.sessionId}`,
        createdAt: new Date().toISOString(),
      });
    return NextResponse.json({ checkoutUrl: session.checkoutUrl });
  } catch (error) {
    logOperationalError("checkout.creation_failed", requestId, error, {
      hasAttempt: Boolean(attemptHash),
    });
    if (attemptHash && payloadHash && recoveryToken) {
      const [concurrentAttempt] = await getDb()
        .select()
        .from(bookings)
        .where(eq(bookings.checkoutAttemptHash, attemptHash))
        .limit(1)
        .catch(() => []);
      if (concurrentAttempt?.checkoutPayloadHash === payloadHash) {
        try {
          return await existingCheckoutResponse(request, concurrentAttempt, recoveryToken, checkoutInput);
        } catch (recoveryError) {
          logOperationalError("checkout.recovery_failed", requestId, recoveryError);
        }
      }
    }
    const message =
      error instanceof Error && error.message === "STRIPE_NOT_CONFIGURED"
        ? "Stripe test mode is not configured yet."
        : error instanceof Error && error.message === "CHECKOUT_SECURITY_NOT_CONFIGURED"
          ? "Secure checkout is temporarily unavailable."
        : "Payment checkout could not start. Please try again.";
    return NextResponse.json(
      { code: "CHECKOUT_UNAVAILABLE", error: message, retryable: true, requestId },
      { status: 503, headers: monitoredHeaders(requestId, startedAt) },
    );
  }
}
