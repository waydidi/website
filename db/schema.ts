import { sql } from "drizzle-orm";
import { blob, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const bookings = sqliteTable(
  "bookings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reference: text("reference").notNull().unique(),
    customerName: text("customer_name").notNull(),
    customerSurname: text("customer_surname"),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull().default(""),
    pickup: text("pickup").notNull(),
    dropoff: text("dropoff").notNull(),
    pickupDate: text("pickup_date").notNull(),
    pickupTime: text("pickup_time").notNull(),
    passengers: integer("passengers").notNull(),
    luggage: integer("luggage").notNull(),
    flightNumber: text("flight_number"),
    flightStatus: text("flight_status"),
    flightAirline: text("flight_airline"),
    flightDepartureAirport: text("flight_departure_airport"),
    flightArrivalAirport: text("flight_arrival_airport"),
    flightScheduledArrival: text("flight_scheduled_arrival"),
    flightEstimatedArrival: text("flight_estimated_arrival"),
    flightLastCheckedAt: text("flight_last_checked_at"),
    pickupSign: text("pickup_sign"),
    pickupInstructions: text("pickup_instructions"),
    childSeats: integer("child_seats").notNull().default(0),
    oversizedLuggage: integer("oversized_luggage", { mode: "boolean" })
      .notNull()
      .default(false),
    specialRequests: text("special_requests"),
    vehicle: text("vehicle").notNull(),
    paymentMethod: text("payment_method").notNull(),
    total: integer("total").notNull(),
    status: text("status").notNull().default("pending_payment"),
    checkoutSessionId: text("checkout_session_id"),
    checkoutAttemptHash: text("checkout_attempt_hash"),
    checkoutPayloadHash: text("checkout_payload_hash"),
    paymentIntentId: text("payment_intent_id"),
    paymentStatus: text("payment_status").notNull().default("pending"),
    paymentStatusUpdatedAt: text("payment_status_updated_at"),
    amountPaid: integer("amount_paid").notNull().default(0),
    paymentCurrency: text("payment_currency").notNull().default("thb"),
    paymentFailureCode: text("payment_failure_code"),
    paymentFailureMessage: text("payment_failure_message"),
    lastPaymentCheckedAt: text("last_payment_checked_at"),
    reconciliationStatus: text("reconciliation_status").notNull().default("pending"),
    reconciliationAttempts: integer("reconciliation_attempts").notNull().default(0),
    fulfillmentStatus: text("fulfillment_status").notNull().default("pending"),
    fulfillmentStartedAt: text("fulfillment_started_at"),
    refundId: text("refund_id"),
    cancelledAt: text("cancelled_at"),
    termsAcceptedAt: text("terms_accepted_at"),
    policyVersion: text("policy_version"),
    accessTokenHash: text("access_token_hash").notNull(),
    tripPinHash: text("trip_pin_hash"),
    tripPinCreatedAt: text("trip_pin_created_at"),
    pdfKey: text("pdf_key"),
    emailStatus: text("email_status").notNull().default("pending"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    fareQuoteId: text("fare_quote_id"),
    returnFareQuoteId: text("return_fare_quote_id"),
    returnPickup: text("return_pickup"),
    returnDropoff: text("return_dropoff"),
    returnDate: text("return_date"),
    returnTime: text("return_time"),
    outboundTotal: integer("outbound_total"),
    returnTotal: integer("return_total"),
    returnDistanceMeters: integer("return_distance_meters"),
    returnDurationSeconds: integer("return_duration_seconds"),
    returnRoutePolyline: text("return_route_polyline"),
    pricingArea: text("pricing_area"),
    routeDistanceMeters: integer("route_distance_meters"),
    routeDurationSeconds: integer("route_duration_seconds"),
    expectedRoutePolyline: text("expected_route_polyline"),
    pickupLatitude: real("pickup_latitude"),
    pickupLongitude: real("pickup_longitude"),
    dropoffLatitude: real("dropoff_latitude"),
    dropoffLongitude: real("dropoff_longitude"),
    preparationBufferMinutes: integer("preparation_buffer_minutes").notNull().default(30),
    postTripBufferMinutes: integer("post_trip_buffer_minutes").notNull().default(30),
    attentionStatus: text("attention_status").notNull().default("normal"),
    attentionReason: text("attention_reason"),
    internalNotes: text("internal_notes"),
    basePrice: integer("base_price"),
    distanceSurcharge: integer("distance_surcharge"),
    pricingVersion: integer("pricing_version"),
    serviceType: text("service_type").notNull().default("transfer"),
    bookedHours: integer("booked_hours"),
    scheduledEndAt: text("scheduled_end_at"),
    hourlyQuoteId: text("hourly_quote_id"),
    includedDistanceMeters: integer("included_distance_meters"),
    extraHourRate: integer("extra_hour_rate"),
    extraDistanceRate: integer("extra_distance_rate"),
    bookingVersion: integer("booking_version").notNull().default(1),
    cancellationReason: text("cancellation_reason"),
    cancelledBy: text("cancelled_by"),
    refundStatus: text("refund_status"),
    refundAmount: integer("refund_amount"),
    refundRequestedAt: text("refund_requested_at"),
    refundCompletedAt: text("refund_completed_at"),
    binnedAt: text("binned_at"),
    purgeAfter: text("purge_after"),
    binnedBy: text("binned_by"),
    binPreviousStatus: text("bin_previous_status"),
  },
  (table) => [
    index("idx_bookings_email").on(table.customerEmail),
    index("idx_bookings_status").on(table.status),
    uniqueIndex("idx_bookings_checkout_attempt").on(table.checkoutAttemptHash),
    index("idx_bookings_pickup_date_status").on(table.pickupDate, table.status),
    index("idx_bookings_return_date_status").on(table.returnDate, table.status),
    index("idx_bookings_bin_purge").on(table.status, table.purgeAfter),
    index("idx_bookings_payment_reconciliation").on(table.paymentStatus, table.reconciliationStatus),
  ],
);

export const bookingPayments = sqliteTable(
  "booking_payments",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    provider: text("provider").notNull(),
    status: text("status").notNull(),
    providerSessionId: text("provider_session_id"),
    providerTransactionId: text("provider_transaction_id"),
    providerStatus: text("provider_status"),
    refundedMinor: integer("refunded_minor").notNull().default(0),
    feeMinor: integer("fee_minor"),
    disputeStatus: text("dispute_status"),
    amountExpected: integer("amount_expected").notNull(),
    amountExpectedMinor: integer("amount_expected_minor"),
    amountPaidMinor: integer("amount_paid_minor"),
    amountPaid: integer("amount_paid").notNull().default(0),
    currency: text("currency").notNull().default("thb"),
    failureCode: text("failure_code"),
    failureMessage: text("failure_message"),
    reconciliationStatus: text("reconciliation_status").notNull().default("pending"),
    reconciliationAttempts: integer("reconciliation_attempts").notNull().default(0),
    lastCheckedAt: text("last_checked_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_booking_payments_reference").on(table.bookingReference),
    uniqueIndex("uidx_booking_payments_provider_session").on(table.provider, table.providerSessionId),
    uniqueIndex("uidx_booking_payments_provider_transaction").on(table.provider, table.providerTransactionId),
    index("idx_booking_payments_status").on(table.status, table.reconciliationStatus),
  ],
);

export const paymentProviderEvents = sqliteTable(
  "payment_provider_events",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadHash: text("payload_hash").notNull(),
    processingStatus: text("processing_status").notNull().default("processing"),
    processingAttempts: integer("processing_attempts").notNull().default(1),
    failureCode: text("failure_code"),
    receivedAt: text("received_at").notNull(),
    processedAt: text("processed_at"),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("idx_payment_provider_events_provider_event").on(table.provider, table.providerEventId),
    index("idx_payment_provider_events_status_received").on(table.processingStatus, table.receivedAt),
  ],
);

export const flightStatusCache = sqliteTable(
  "flight_status_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    flightNumber: text("flight_number").notNull(),
    flightDate: text("flight_date").notNull(),
    status: text("status").notNull(),
    airline: text("airline"),
    departureAirport: text("departure_airport"),
    arrivalAirport: text("arrival_airport"),
    scheduledArrival: text("scheduled_arrival"),
    estimatedArrival: text("estimated_arrival"),
    actualArrival: text("actual_arrival"),
    terminal: text("terminal"),
    fetchedAt: text("fetched_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [index("idx_flight_cache_lookup").on(table.flightNumber, table.flightDate)],
);

export const hourlyPackages = sqliteTable(
  "hourly_packages",
  {
    id: text("id").primaryKey(),
    areaId: text("area_id").notNull().default("ANY"),
    vehicleId: text("vehicle_id").notNull(),
    minimumHours: integer("minimum_hours").notNull().default(3),
    basePrice: integer("base_price").notNull(),
    additionalHourPrice: integer("additional_hour_price").notNull(),
    includedKmPerHour: integer("included_km_per_hour").notNull(),
    extraPricePerKm: integer("extra_price_per_km").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    version: integer("version").notNull().default(1),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_hourly_packages_area_vehicle").on(table.areaId, table.vehicleId)],
);

// By-the-hour prices per city (lib/hourly-areas-data.ts) and car. The row with
// vehicle_id "_area" holds the city's on/off switch and list order.
export const hourlyAreaRates = sqliteTable(
  "hourly_area_rates",
  {
    id: text("id").primaryKey(),
    areaSlug: text("area_slug").notNull(),
    vehicleId: text("vehicle_id").notNull(),
    hourlyRate: integer("hourly_rate").notNull().default(0),
    p4: integer("p4").notNull().default(0),
    p5: integer("p5").notNull().default(0),
    p6: integer("p6").notNull().default(0),
    p8: integer("p8").notNull().default(0),
    p10: integer("p10").notNull().default(0),
    c6: integer("c6").notNull().default(0),
    c7: integer("c7").notNull().default(0),
    c8: integer("c8").notNull().default(0),
    c9: integer("c9").notNull().default(0),
    c10: integer("c10").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_hourly_area_rates_area").on(table.areaSlug)],
);

export const hourlyOvertimeCharges = sqliteTable("hourly_overtime_charges", {
  bookingReference: text("booking_reference").primaryKey().references(() => bookings.reference),
  extraMinutes: integer("extra_minutes").notNull(),
  chargedHours: integer("charged_hours").notNull(),
  hourlyRate: integer("hourly_rate").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  assessedBy: text("assessed_by").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const hourlyOvertimeReceipts = sqliteTable("hourly_overtime_receipts", {
  id: text("id").primaryKey(),
  bookingReference: text("booking_reference").notNull().references(() => hourlyOvertimeCharges.bookingReference),
  amountMinor: integer("amount_minor").notNull(),
  collectedBy: text("collected_by").notNull(),
  createdAt: text("created_at").notNull(),
});

export const hourlyCityPairRates = sqliteTable("hourly_city_pair_rates", {
  id: text("id").primaryKey(),
  pairId: text("pair_id").notNull(),
  vehicleId: text("vehicle_id").notNull(),
  c6: integer("c6").notNull().default(0),
  c7: integer("c7").notNull().default(0),
  c8: integer("c8").notNull().default(0),
  c9: integer("c9").notNull().default(0),
  c10: integer("c10").notNull().default(0),
  extraHourRate: integer("extra_hour_rate").notNull().default(0),
  maxDrivingMinutes: integer("max_driving_minutes").notNull().default(360),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("idx_hourly_pair_vehicle").on(table.pairId, table.vehicleId)]);

export const hourlyQuotes = sqliteTable(
  "hourly_quotes",
  {
    id: text("id").primaryKey(),
    pickupPlaceId: text("pickup_place_id").notNull(),
    pickupText: text("pickup_text").notNull(),
    pickupLatitude: real("pickup_latitude"),
    pickupLongitude: real("pickup_longitude"),
    areaId: text("area_id"),
    areaName: text("area_name").notNull(),
    cityPairId: text("city_pair_id"),
    pricingAreaSlug: text("pricing_area_slug"),
    routeDistanceMeters: integer("route_distance_meters"),
    routeDurationSeconds: integer("route_duration_seconds"),
    routePolyline: text("route_polyline"),
    bookedHours: integer("booked_hours").notNull(),
    dropoffText: text("dropoff_text"),
    dropoffLatitude: real("dropoff_latitude"),
    dropoffLongitude: real("dropoff_longitude"),
    vehiclePricesJson: text("vehicle_prices_json").notNull(),
    pricingVersion: integer("pricing_version").notNull(),
    departureDate: text("departure_date"),
    departureTime: text("departure_time"),
    timezone: text("timezone").notNull().default("Asia/Bangkok"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_hourly_quotes_expires_at").on(table.expiresAt)],
);

export const pricingAreas = sqliteTable(
  "pricing_areas",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").notNull().unique(),
    color: text("color").notNull().default("#FF8A05"),
    pricingType: text("pricing_type").notNull().default("hybrid"),
    priority: integer("priority").notNull().default(50),
    status: text("status").notNull().default("draft"),
    draftGeometryJson: text("draft_geometry_json"),
    publishedGeometryJson: text("published_geometry_json"),
    version: integer("version").notNull().default(1),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    publishedAt: text("published_at"),
  },
  (table) => [
    index("idx_pricing_areas_status_priority").on(table.status, table.priority),
  ],
);

export const pricingRules = sqliteTable(
  "pricing_rules",
  {
    id: text("id").primaryKey(),
    areaId: text("area_id").notNull(),
    originCode: text("origin_code").notNull().default("ANY"),
    vehicleId: text("vehicle_id").notNull(),
    basePrice: integer("base_price").notNull(),
    includedDistanceKm: integer("included_distance_km").notNull().default(0),
    extraPricePerKm: integer("extra_price_per_km").notNull().default(0),
    fixedPrice: integer("fixed_price"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    version: integer("version").notNull().default(1),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_pricing_rules_area_vehicle").on(table.areaId, table.vehicleId),
  ],
);

export const fareQuotes = sqliteTable(
  "fare_quotes",
  {
    id: text("id").primaryKey(),
    pickupPlaceId: text("pickup_place_id").notNull(),
    dropoffPlaceId: text("dropoff_place_id").notNull(),
    pickupText: text("pickup_text").notNull(),
    dropoffText: text("dropoff_text").notNull(),
    areaId: text("area_id").notNull(),
    areaName: text("area_name").notNull(),
    distanceMeters: integer("distance_meters").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    routePolyline: text("route_polyline"),
    pickupLatitude: real("pickup_latitude"),
    pickupLongitude: real("pickup_longitude"),
    dropoffLatitude: real("dropoff_latitude"),
    dropoffLongitude: real("dropoff_longitude"),
    vehiclePricesJson: text("vehicle_prices_json").notNull(),
    pricingVersion: integer("pricing_version").notNull(),
    departureDate: text("departure_date"),
    departureTime: text("departure_time"),
    timezone: text("timezone").notNull().default("Asia/Bangkok"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_fare_quotes_expires_at").on(table.expiresAt)],
);

// Route rules for what a fare includes, e.g. tolls between Bangkok and Pattaya.
// Zones are polygons ([[lat, lng], ...] rings) held on the rule itself, so a
// rule works whether or not pricing areas are drawn for those places.
export const routeInclusions = sqliteTable(
  "route_inclusions",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    originZoneJson: text("origin_zone_json").notNull(),
    destinationZoneJson: text("destination_zone_json").notNull(),
    // Also applies from the destination back to the origin.
    bidirectional: integer("bidirectional", { mode: "boolean" }).notNull().default(true),
    includesTolls: integer("includes_tolls", { mode: "boolean" }).notNull().default(true),
    includesFerry: integer("includes_ferry", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    priority: integer("priority").notNull().default(50),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_route_inclusions_active").on(table.active, table.priority)],
);

// Promo codes (admin-managed). Amounts are whole THB; percent is 1-100.
export const promoCodes = sqliteTable(
  "promo_codes",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull().unique(),
    title: text("title").notNull(),
    discountType: text("discount_type").notNull(), // "percent" | "fixed"
    discountValue: integer("discount_value").notNull(),
    maxDiscount: integer("max_discount"),
    minFare: integer("min_fare").notNull().default(0),
    startsAt: text("starts_at"),
    endsAt: text("ends_at"),
    maxUses: integer("max_uses"),
    perCustomerLimit: integer("per_customer_limit").notNull().default(1),
    firstBookingOnly: integer("first_booking_only", { mode: "boolean" }).notNull().default(false),
    service: text("service").notNull().default("any"), // "any" | "transfer" | "hourly"
    vehiclesJson: text("vehicles_json"),
    offerTermsJson: text("offer_terms_json"),
    showOnHomepage: integer("show_on_homepage", { mode: "boolean" }).notNull().default(false),
    status: text("status").notNull().default("draft"), // "draft" | "active" | "paused"
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_promo_codes_status").on(table.status)],
);

// Extra people who get the booking emails: the booker (when booking for someone
// else while signed in) or an address the customer asked to copy in.
export const bookingContacts = sqliteTable(
  "booking_contacts",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    email: text("email").notNull(),
    role: text("role").notNull(), // "booker" | "copy"
    createdAt: text("created_at").notNull(),
  },
  (table) => [uniqueIndex("uidx_booking_contacts_ref_email").on(table.bookingReference, table.email)],
);

// Tax invoice details a customer asked for at checkout (one per booking).
export const bookingTaxInvoices = sqliteTable(
  "booking_tax_invoices",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull().unique(),
    name: text("name").notNull(),
    taxId: text("tax_id").notNull(),
    branch: text("branch").notNull(),
    address: text("address").notNull(),
    createdAt: text("created_at").notNull(),
  },
);

// One row per booking that used a code. A use counts while its booking is live
// (not expired, cancelled or refunded), so abandoned checkouts free it again.
export const promoRedemptions = sqliteTable(
  "promo_redemptions",
  {
    id: text("id").primaryKey(),
    promoId: text("promo_id").notNull(),
    code: text("code").notNull(),
    bookingReference: text("booking_reference").notNull().unique(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerId: text("customer_id"),
    originalTotal: integer("original_total").notNull(),
    discount: integer("discount").notNull(),
    finalTotal: integer("final_total").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_promo_redemptions_promo").on(table.promoId),
    index("idx_promo_redemptions_email").on(table.customerEmail),
  ],
);

export const pricingAudit = sqliteTable(
  "pricing_audit",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    areaId: text("area_id").notNull(),
    action: text("action").notNull(),
    actorEmail: text("actor_email").notNull(),
    detailsJson: text("details_json"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_pricing_audit_area_created").on(table.areaId, table.createdAt),
  ],
);

export const bookingEvents = sqliteTable(
  "booking_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    bookingReference: text("booking_reference").notNull(),
    eventType: text("event_type").notNull(),
    providerEventId: text("provider_event_id").unique(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_booking_events_reference").on(table.bookingReference)],
);

export const bookingManagementSessions = sqliteTable(
  "booking_management_sessions",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at").notNull(),
  },
  (table) => [
    index("idx_management_sessions_reference").on(table.bookingReference),
    index("idx_management_sessions_expires").on(table.expiresAt),
  ],
);

export const bookingChanges = sqliteTable(
  "booking_changes",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    changeType: text("change_type").notNull(),
    previousJson: text("previous_json"),
    nextJson: text("next_json"),
    reason: text("reason"),
    actor: text("actor").notNull().default("customer"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_booking_changes_reference_created").on(table.bookingReference, table.createdAt)],
);

export const bookingChangeRequests = sqliteTable(
  "booking_change_requests",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    status: text("status").notNull().default("pending"),
    pickup: text("pickup").notNull(),
    dropoff: text("dropoff").notNull(),
    pickupPlaceId: text("pickup_place_id").notNull(),
    dropoffPlaceId: text("dropoff_place_id").notNull(),
    pickupDate: text("pickup_date").notNull(),
    pickupTime: text("pickup_time").notNull(),
    vehicleId: text("vehicle_id").notNull(),
    vehicleName: text("vehicle_name").notNull(),
    fareQuoteId: text("fare_quote_id").notNull(),
    returnFareQuoteId: text("return_fare_quote_id"),
    distanceMeters: integer("distance_meters").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    originalTotal: integer("original_total").notNull(),
    revisedTotal: integer("revised_total").notNull(),
    priceDifference: integer("price_difference").notNull(),
    reason: text("reason"),
    bookingVersion: integer("booking_version").notNull(),
    createdAt: text("created_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("idx_change_requests_booking_created").on(table.bookingReference, table.createdAt),
    index("idx_change_requests_status_created").on(table.status, table.createdAt),
  ],
);

export const checkoutAttempts = sqliteTable(
  "checkout_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fingerprintHash: text("fingerprint_hash").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_checkout_attempts_fingerprint_created").on(
      table.fingerprintHash,
      table.createdAt,
    ),
  ],
);

export const drivers = sqliteTable(
  "drivers",
  {
    id: text("id").primaryKey(),
    fullName: text("full_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    baseLocation: text("base_location").notNull().default(""),
    vehicle: text("vehicle").notNull().default(""),
    bankCode: text("bank_code").notNull().default(""),
    bankAccountNumber: text("bank_account_number").notNull().default(""),
    bankAccountName: text("bank_account_name").notNull().default(""),
    idImageKey: text("id_image_key"),
    idImageMime: text("id_image_mime"),
    idImageBytes: integer("id_image_bytes"),
    idImageSha256: text("id_image_sha256"),
    carImageKey: text("car_image_key"),
    carImageMime: text("car_image_mime"),
    carImageBytes: integer("car_image_bytes"),
    carImageSha256: text("car_image_sha256"),
    remindersEnabled: integer("reminders_enabled", { mode: "boolean" }).notNull().default(true),
    status: text("status").notNull().default("active"),
    carPlate: text("car_plate"),
    driverType: text("driver_type").notNull().default("staff"),
    photoKey: text("photo_key"),
    photoMime: text("photo_mime"),
    vehicleType: text("vehicle_type"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_drivers_status_name").on(table.status, table.fullName)],
);

export const bookingAssignments = sqliteTable(
  "booking_assignments",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    leg: text("leg").notNull().default("outbound"),
    driverId: text("driver_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    currentStatus: text("current_status").notNull().default("assigned"),
    assignedBy: text("assigned_by").notNull(),
    assignedAt: text("assigned_at").notNull(),
    tokenExpiresAt: text("token_expires_at").notNull(),
    revokedAt: text("revoked_at"),
    completedAt: text("completed_at"),
    updatedAt: text("updated_at").notNull(),
    reconfirmationRequired: integer("reconfirmation_required", { mode: "boolean" }).notNull().default(false),
    passengerVerifiedAt: text("passenger_verified_at"),
    passengerVerificationMethod: text("passenger_verification_method"),
    passengerVerifiedBy: text("passenger_verified_by"),
  },
  (table) => [
    uniqueIndex("uidx_assignment_active_leg").on(table.bookingReference, table.leg).where(sql`${table.revokedAt} IS NULL`),
    index("idx_assignments_booking_active").on(table.bookingReference, table.revokedAt),
    index("idx_assignments_driver_status").on(table.driverId, table.currentStatus),
  ],
);

export const driverPayoutDetails = sqliteTable(
  "driver_payout_details",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    assignmentId: text("assignment_id").notNull().unique(),
    driverId: text("driver_id").notNull(),
    bankCode: text("bank_code").notNull(),
    accountNumber: text("account_number").notNull(),
    accountName: text("account_name").notNull(),
    submittedAt: text("submitted_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_driver_payout_details_booking").on(table.bookingReference)],
);

export const passengerVerifications = sqliteTable(
  "passenger_verifications",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    assignmentId: text("assignment_id").notNull(),
    driverId: text("driver_id").notNull(),
    result: text("result").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    latitude: real("latitude"),
    longitude: real("longitude"),
    accuracyMetres: integer("accuracy_metres"),
    actor: text("actor").notNull(),
    reason: text("reason"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_passenger_verifications_assignment_created").on(table.assignmentId, table.createdAt),
    index("idx_passenger_verifications_booking_created").on(table.bookingReference, table.createdAt),
  ],
);

export const journeyLocations = sqliteTable(
  "journey_locations",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    assignmentId: text("assignment_id").notNull(),
    driverId: text("driver_id").notNull(),
    latitude: real("latitude").notNull(),
    longitude: real("longitude").notNull(),
    accuracyMetres: integer("accuracy_metres").notNull(),
    clientTimestamp: text("client_timestamp").notNull(),
    serverTimestamp: text("server_timestamp").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    quality: text("quality").notNull().default("good"),
    purgeAfter: text("purge_after").notNull(),
  },
  (table) => [
    uniqueIndex("idx_journey_locations_assignment_sequence").on(table.assignmentId, table.sequenceNumber),
    index("idx_journey_locations_assignment_server").on(table.assignmentId, table.serverTimestamp),
    index("idx_journey_locations_purge").on(table.purgeAfter),
  ],
);

export const journeyExceptions = sqliteTable(
  "journey_exceptions",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    assignmentId: text("assignment_id").notNull(),
    exceptionType: text("exception_type").notNull(),
    status: text("status").notNull().default("open"),
    severity: text("severity").notNull().default("warning"),
    distanceMetres: integer("distance_metres").notNull(),
    corridorMetres: integer("corridor_metres").notNull(),
    consecutivePoints: integer("consecutive_points").notNull(),
    stopDurationSeconds: integer("stop_duration_seconds"),
    stopReason: text("stop_reason"),
    startedAt: text("started_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull(),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_journey_exceptions_assignment_status").on(table.assignmentId, table.status),
    index("idx_journey_exceptions_status_updated").on(table.status, table.updatedAt),
  ],
);

export const journeyStopDeclarations = sqliteTable(
  "journey_stop_declarations",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    assignmentId: text("assignment_id").notNull(),
    reason: text("reason").notNull(),
    note: text("note"),
    declaredAt: text("declared_at").notNull(),
    clearedAt: text("cleared_at"),
  },
  (table) => [
    index("idx_journey_stop_declarations_assignment_active").on(table.assignmentId, table.clearedAt),
  ],
);

export const driverOffers = sqliteTable(
  "driver_offers",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    driverId: text("driver_id").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    offeredCost: integer("offered_cost").notNull(),
    status: text("status").notNull().default("pending"),
    expiresAt: text("expires_at").notNull(),
    respondedAt: text("responded_at"),
    responseNote: text("response_note"),
    acceptanceLock: text("acceptance_lock").unique(),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_driver_offers_booking_status").on(table.bookingReference, table.status),
    index("idx_driver_offers_driver_created").on(table.driverId, table.createdAt),
    index("idx_driver_offers_expiry").on(table.status, table.expiresAt),
  ],
);

export const bookingCosts = sqliteTable(
  "booking_costs",
  {
    bookingReference: text("booking_reference").primaryKey(),
    acceptedOfferId: text("accepted_offer_id"),
    agreedDriverCost: integer("agreed_driver_cost").notNull().default(0),
    additionalCosts: integer("additional_costs").notNull().default(0),
    totalDriverCost: integer("total_driver_cost").notNull().default(0),
    paymentStatus: text("payment_status").notNull().default("unpaid"),
    paidAt: text("paid_at"),
    paymentReference: text("payment_reference"),
    notes: text("notes"),
    updatedBy: text("updated_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_booking_costs_payment_status").on(table.paymentStatus, table.updatedAt),
  ],
);

export const driverStatusEvents = sqliteTable(
  "driver_status_events",
  {
    tripEvidenceId: text("trip_evidence_id"),
    confirmedAt: text("confirmed_at"),
    id: text("id").primaryKey(),
    assignmentId: text("assignment_id").notNull(),
    bookingReference: text("booking_reference").notNull(),
    status: text("status").notNull(),
    previousStatus: text("previous_status").notNull(),
    latitude: real("latitude"),
    longitude: real("longitude"),
    accuracyMetres: integer("accuracy_metres"),
    expectedDistanceMetres: integer("expected_distance_metres"),
    driverNote: text("driver_note"),
    evidenceKey: text("evidence_key"),
    evidenceMime: text("evidence_mime"),
    evidenceBytes: integer("evidence_bytes"),
    evidenceSha256: text("evidence_sha256"),
    verificationStatus: text("verification_status").notNull().default("pending_review"),
    verifiedBy: text("verified_by"),
    verifiedAt: text("verified_at"),
    rejectionReason: text("rejection_reason"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_driver_events_assignment_created").on(table.assignmentId, table.createdAt),
    index("idx_driver_events_verification").on(table.verificationStatus, table.createdAt),
  ],
);

export const driverAvailability = sqliteTable(
  "driver_availability",
  {
    id: text("id").primaryKey(),
    driverId: text("driver_id").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    availabilityType: text("availability_type").notNull().default("unavailable"),
    reason: text("reason"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_driver_availability_driver_start").on(table.driverId, table.startsAt),
    index("idx_driver_availability_range").on(table.startsAt, table.endsAt),
  ],
);

export const operationsCalendarEvents = sqliteTable(
  "operations_calendar_events",
  {
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull().default("operations_note"),
    title: text("title").notNull(),
    startsAt: text("starts_at").notNull(),
    endsAt: text("ends_at").notNull(),
    driverId: text("driver_id"),
    notes: text("notes"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_operations_calendar_events_range").on(table.startsAt, table.endsAt),
    index("idx_operations_calendar_events_driver").on(table.driverId, table.startsAt),
  ],
);

export const bookingNotifications = sqliteTable(
  "booking_notifications",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    assignmentId: text("assignment_id"),
    notificationType: text("notification_type").notNull(),
    channel: text("channel").notNull().default("email"),
    recipient: text("recipient").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    scheduledFor: text("scheduled_for").notNull(),
    status: text("status").notNull().default("queued"),
    attemptCount: integer("attempt_count").notNull().default(0),
    lastAttemptAt: text("last_attempt_at"),
    sentAt: text("sent_at"),
    errorMessage: text("error_message"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_booking_notifications_due").on(table.status, table.scheduledFor),
    index("idx_booking_notifications_reference").on(table.bookingReference, table.createdAt),
  ],
);

export const operationsAlerts = sqliteTable(
  "operations_alerts",
  {
    id: text("id").primaryKey(),
    bookingReference: text("booking_reference").notNull(),
    assignmentId: text("assignment_id"),
    alertType: text("alert_type").notNull(),
    severity: text("severity").notNull().default("warning"),
    title: text("title").notNull(),
    details: text("details"),
    dedupeKey: text("dedupe_key").notNull().unique(),
    status: text("status").notNull().default("open"),
    expectedAt: text("expected_at"),
    detectedAt: text("detected_at").notNull(),
    acknowledgedAt: text("acknowledged_at"),
    acknowledgedBy: text("acknowledged_by"),
    resolvedAt: text("resolved_at"),
    resolutionNote: text("resolution_note"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("idx_operations_alerts_status_detected").on(table.status, table.detectedAt),
    index("idx_operations_alerts_reference").on(table.bookingReference, table.createdAt),
  ],
);

// Customer accounts. Sign-in is passwordless: a one-time code is emailed and
// only its hash is stored. Bookings are linked by verified email, and by
// customer_booking_links for bookings made while signed in (a separate table
// because bookings is already at D1's 100-column limit).
export const customers = sqliteTable(
  "customers",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    surname: text("surname"),
    phone: text("phone"),
    contactPreference: text("contact_preference").notNull().default("email"),
    language: text("language").notNull().default("en"),
    marketingOptIn: integer("marketing_opt_in", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    lastSeenAt: text("last_seen_at"),
  },
  (table) => [uniqueIndex("uidx_customers_email").on(table.email)],
);

export const customerLoginCodes = sqliteTable(
  "customer_login_codes",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("idx_customer_login_codes_email_created").on(table.email, table.createdAt),
    index("idx_customer_login_codes_expires").on(table.expiresAt),
  ],
);

export const customerSessions = sqliteTable(
  "customer_sessions",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    userAgent: text("user_agent"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_customer_sessions_token").on(table.tokenHash),
    index("idx_customer_sessions_customer").on(table.customerId),
    index("idx_customer_sessions_expires").on(table.expiresAt),
  ],
);

export const customerBookingLinks = sqliteTable(
  "customer_booking_links",
  {
    bookingReference: text("booking_reference").primaryKey(),
    customerId: text("customer_id").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_customer_booking_links_customer").on(table.customerId)],
);

// Saved addresses (Home, Hotel, Office…) that pre-fill the search form.
// Stored as Google Place IDs so they drop straight into the route picker.
// Tax invoice details a member saved for reuse at checkout.
export const customerBillingProfiles = sqliteTable(
  "customer_billing_profiles",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    name: text("name").notNull(),
    taxId: text("tax_id").notNull(),
    branch: text("branch").notNull(),
    address: text("address").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_customer_billing_customer").on(table.customerId)],
);

export const customerSavedPlaces = sqliteTable(
  "customer_saved_places",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    label: text("label").notNull(),
    placeId: text("place_id").notNull(),
    address: text("address").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_customer_saved_places_customer").on(table.customerId)],
);

// Travellers a customer books for, used to pre-fill passenger details.
export const customerSavedPassengers = sqliteTable(
  "customer_saved_passengers",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    name: text("name").notNull(),
    surname: text("surname").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("idx_customer_saved_passengers_customer").on(table.customerId)],
);

// Social sign-in identities (Google, Apple, LINE, Facebook) linked to a
// customer. Keyed by the provider's stable user ID, so a later sign-in works
// even if the email on that provider account changes.
export const customerIdentities = sqliteTable(
  "customer_identities",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    email: text("email"),
    createdAt: text("created_at").notNull(),
    lastUsedAt: text("last_used_at").notNull(),
  },
  (table) => [
    uniqueIndex("uidx_customer_identities_provider_user").on(table.provider, table.providerUserId),
    index("idx_customer_identities_customer").on(table.customerId),
  ],
);

// Travel guides written in Admin → Blog. Content is a list of blocks (paragraph,
// heading, list, tip, image, booking card) stored as JSON.
export const blogPosts = sqliteTable(
  "blog_posts",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    excerpt: text("excerpt").notNull().default(""),
    status: text("status").notNull().default("draft"), // draft | published | trash
    publishedAt: text("published_at"),
    categoriesJson: text("categories_json").notNull().default("[]"),
    featured: integer("featured", { mode: "boolean" }).notNull().default(false),
    popularRank: integer("popular_rank"),
    featuredImage: text("featured_image"),
    coverJson: text("cover_json").notNull().default("{}"),
    routeJson: text("route_json"),
    blocksJson: text("blocks_json").notNull().default("[]"),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    author: text("author").notNull().default("Waydidi team"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [uniqueIndex("uidx_blog_posts_slug").on(table.slug), index("idx_blog_posts_status_published").on(table.status, table.publishedAt)],
);


// Old permalinks of blog posts, so links to a renamed post redirect (301) to its new slug.
export const blogSlugHistory = sqliteTable("blog_slug_history", {
  oldSlug: text("old_slug").primaryKey(),
  postId: text("post_id").notNull(),
  createdAt: text("created_at").notNull(),
});

// Where a booking came from, e.g. "blog:suvarnabhumi-airport-to-pattaya" when the
// customer tapped "See prices" in a travel guide.
export const bookingSources = sqliteTable(
  "booking_sources",
  {
    bookingReference: text("booking_reference").primaryKey(),
    source: text("source").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_booking_sources_source").on(table.source)],
);

// Automatic member-tier discount on a booking. Applied after any promo code, so the
// two combine; kept apart from promo_redemptions (one row per booking there).
export const bookingMemberDiscounts = sqliteTable("booking_member_discounts", {
  bookingReference: text("booking_reference").primaryKey(),
  customerId: text("customer_id").notNull(),
  tier: text("tier").notNull(),
  percent: integer("percent").notNull(),
  discount: integer("discount").notNull(),
  createdAt: text("created_at").notNull(),
});

// One wheel spin per member: the prize won and when it expires. Using it is
// recorded in promo_redemptions under the code "SPIN".
export const memberSpins = sqliteTable("member_spins", {
  customerId: text("customer_id").primaryKey(),
  prizeId: text("prize_id").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

// Add-ons given free by the member's tier on a booking (Diamond: 1 child seat;
// Platinum: 1 child seat + currency exchange stop). Receipts read this.
export const bookingFreeAddons = sqliteTable("booking_free_addons", {
  bookingReference: text("booking_reference").primaryKey(),
  tier: text("tier").notNull(),
  childSeats: integer("child_seats").notNull().default(0),
  exchangeStop: integer("exchange_stop", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

// Badge gifts issued to members (see lib/gift-rules.ts). A gift counts as used
// only while its booking is live; an expired or failed booking frees it again.
export const memberGifts = sqliteTable(
  "member_gifts",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    giftId: text("gift_id").notNull(),
    tier: text("tier").notNull(),
    issuedAt: text("issued_at").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedBookingReference: text("used_booking_reference"),
    usedAt: text("used_at"),
  },
  (table) => [index("idx_member_gifts_customer").on(table.customerId)],
);

// Mystery box prize catalog, edited in Admin → Member gifts.
export const mysteryPrizes = sqliteTable("mystery_prizes", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  emoji: text("emoji").notNull().default("🎁"),
  kind: text("kind").notNull(), // coupon | child_seat | exchange_stop | airport_transfer | partner_ticket
  value: integer("value").notNull().default(0),
  weightsJson: text("weights_json").notNull().default("{}"),
  stock: integer("stock"),
  issued: integer("issued").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  validDays: integer("valid_days").notNull().default(90),
  terms: text("terms").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// One mystery box per badge reached (per 12 months). Opening picks a prize.
export const memberBoxes = sqliteTable(
  "member_boxes",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id").notNull(),
    tier: text("tier").notNull(),
    issuedAt: text("issued_at").notNull(),
    openedAt: text("opened_at"),
    prizeId: text("prize_id"),
    prizeName: text("prize_name"),
    giftRowId: text("gift_row_id"), // member_gifts row for ride prizes
    voucherCode: text("voucher_code"), // partner tickets
    fulfilment: text("fulfilment"), // partner tickets: to_arrange | sent | used
    expiresAt: text("expires_at"),
  },
  (table) => [index("idx_member_boxes_customer").on(table.customerId)],
);

// Voucher codes from partners (cruise, restaurant), handed out with ticket prizes.
export const partnerVoucherCodes = sqliteTable(
  "partner_voucher_codes",
  {
    id: text("id").primaryKey(),
    prizeId: text("prize_id").notNull(),
    code: text("code").notNull(),
    boxId: text("box_id"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_partner_codes_prize").on(table.prizeId, table.boxId)],
);

// Reward emails already sent (almost-there, new badge, gift expiring), one per key.
export const memberRewardEmails = sqliteTable("member_reward_emails", {
  dedupeKey: text("dedupe_key").primaryKey(),
  customerId: text("customer_id").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastAttemptAt: text("last_attempt_at"),
  nextAttemptAt: text("next_attempt_at"),
  sentAt: text("sent_at"),
});

// Travel agency partner applications from /agencies.
export const agencyApplications = sqliteTable("agency_applications", {
  id: text("id").primaryKey(),
  agencyName: text("agency_name").notNull(),
  contactName: text("contact_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  country: text("country").notNull(),
  website: text("website"),
  monthlyTransfers: text("monthly_transfers").notNull(),
  message: text("message"),
  status: text("status").notNull().default("new"), // new | contacted | approved | declined
  createdAt: text("created_at").notNull(),
});

// Newsletter sign-ups (e.g. from /agencies), with where they signed up.
export const newsletterSubscribers = sqliteTable("newsletter_subscribers", {
  email: text("email").primaryKey(),
  source: text("source").notNull(),
  createdAt: text("created_at").notNull(),
});

// Driver applications from /drivers.
export const driverApplications = sqliteTable("driver_applications", {
  id: text("id").primaryKey(),
  applicantType: text("applicant_type").notNull(), // individual | fleet
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  city: text("city").notNull(),
  vehicle: text("vehicle").notNull(),
  vehicleYear: text("vehicle_year"),
  fleetSize: text("fleet_size"),
  languages: text("languages"),
  message: text("message"),
  status: text("status").notNull().default("new"),
  createdAt: text("created_at").notNull(),
});

// Private files (driver ID and car photos, trip evidence, blog images) when no R2 bucket is bound.
export const storedFileParts = sqliteTable("stored_file_parts", {
  key: text("key").notNull(),
  part: integer("part").notNull(),
  contentType: text("content_type").notNull(),
  data: blob("data").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [primaryKey({ columns: [table.key, table.part] })]);

// Customer booking forms: a private link the admin sends; the customer fills it
// in step by step and the answers wait here until the admin turns them into a booking.
export const bookingForms = sqliteTable("booking_forms", {
  token: text("token").primaryKey(),
  serviceType: text("service_type").notNull(),
  note: text("note"),
  status: text("status").notNull(),
  answers: text("answers"),
  bookingReference: text("booking_reference"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  submittedAt: text("submitted_at"),
  prefill: text("prefill"),
  agencyId: text("agency_id"),
});

// Public promo codes a member collected from the homepage into My coupons.
export const memberCoupons = sqliteTable("member_coupons", {
  customerId: text("customer_id").notNull(),
  code: text("code").notNull(),
  collectedAt: text("collected_at").notNull(),
}, (table) => [primaryKey({ columns: [table.customerId, table.code] })]);

// Storefront partners: a shop or hotel desk with a Waydidi QR poster. Customers who
// book through it get the store's special price; the store earns a commission.
export const storefronts = sqliteTable("storefronts", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  phone: text("phone"),
  area: text("area"),
  discountPercent: real("discount_percent").notNull().default(0),
  commissionPercent: real("commission_percent").notNull().default(0),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [uniqueIndex("uidx_storefronts_slug").on(table.slug)]);

// One row per booking made through a storefront QR: the price given and the commission owed.
export const bookingStorefronts = sqliteTable("booking_storefronts", {
  bookingReference: text("booking_reference").primaryKey(),
  storefrontId: text("storefront_id").notNull(),
  fareBeforeDiscount: integer("fare_before_discount").notNull(),
  discountPercent: real("discount_percent").notNull(),
  discount: integer("discount").notNull(),
  commissionPercent: real("commission_percent").notNull(),
  commission: integer("commission").notNull(),
  cashAtStore: integer("cash_at_store", { mode: "boolean" }).notNull().default(false),
  settledAt: text("settled_at"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_booking_storefronts_store").on(table.storefrontId)]);

export const journeyLegs = sqliteTable("journey_legs", {
  id: text("id").primaryKey(), bookingReference: text("booking_reference").notNull(),
  leg: text("leg").notNull(), status: text("status").notNull(),
  pickupDate: text("pickup_date"), pickupTime: text("pickup_time"),
  flightDate: text("flight_date"), arrivalPickupOffsetMinutes: integer("arrival_pickup_offset_minutes"),
  createdAt: text("created_at").notNull(), updatedAt: text("updated_at").notNull(),
}, (t) => [uniqueIndex("uidx_journey_leg").on(t.bookingReference, t.leg)]);

export const cashReceipts = sqliteTable("cash_receipts", {
 id: text("id").primaryKey(), bookingReference: text("booking_reference").notNull(),
 amountMinor: integer("amount_minor").notNull(), collectedBy: text("collected_by").notNull(),
 note: text("note"), createdAt: text("created_at").notNull(),
}, t => [index("idx_cash_receipts_booking").on(t.bookingReference)]);

export const journeyCosts = sqliteTable("journey_costs", {
 id:text("id").primaryKey(), bookingReference:text("booking_reference").notNull(), leg:text("leg").notNull(),
 costMinor:integer("cost_minor").notNull(), paymentStatus:text("payment_status").notNull().default("unpaid"),
 updatedBy:text("updated_by").notNull(), createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull(),
},t=>[uniqueIndex("uidx_journey_cost_leg").on(t.bookingReference,t.leg)]);

// LINE bot state: the admin's LINE user, a one-time link code, and which form is waiting for a price.
export const lineState = sqliteTable("line_state", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Seasonal price adjustments (holidays and travel seasons that affect driver supply).
// The pickup date picks the season; when several match, only the highest adjustment applies.
export const priceSeasons = sqliteTable("price_seasons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // YYYY-MM-DD, or MM-DD when the season repeats every year (end before start wraps over New Year).
  startsOn: text("starts_on").notNull(),
  endsOn: text("ends_on").notNull(),
  repeatsYearly: integer("repeats_yearly", { mode: "boolean" }).notNull().default(false),
  adjustmentType: text("adjustment_type").notNull().default("percent"), // "percent" | "fixed"
  adjustment: integer("adjustment").notNull(),
  service: text("service").notNull().default("all"), // "all" | "transfer" | "hourly"
  areaIds: text("area_ids"), // JSON list of fare area ids; null = every area
  vehicleIds: text("vehicle_ids"), // JSON list of vehicle ids; null = every vehicle
  reason: text("reason"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

// Refund records. Amounts are calculated on the server from the booking, the
// payment and the cancellation policy; the provider fee is Waydidi's cost and is
// kept apart from what the customer gets back.
export const bookingRefunds = sqliteTable("booking_refunds", {
  id: text("id").primaryKey(),
  bookingReference: text("booking_reference").notNull(),
  paymentId: text("payment_id"),
  provider: text("provider").notNull(), // stripe | payso | cash
  providerTransactionId: text("provider_transaction_id"),
  providerRefundId: text("provider_refund_id"),
  providerStatus: text("provider_status"),
  idempotencyKey: text("idempotency_key").notNull(),
  reason: text("reason").notNull(), // customer_cancellation | no_show | waydidi_cancellation | goodwill
  note: text("note"),
  policyVersion: text("policy_version").notNull(),
  cancellationRequestedAt: text("cancellation_requested_at").notNull(),
  noticeHours: real("notice_hours").notNull(),
  refundPercent: integer("refund_percent").notNull(),
  originalMinor: integer("original_minor").notNull(),
  customerRefundMinor: integer("customer_refund_minor").notNull(),
  providerRefundFeeMinor: integer("provider_refund_fee_minor").notNull().default(0),
  currency: text("currency").notNull().default("thb"),
  status: text("status").notNull(),
  submissionStartedAt:text("submission_started_at"),
  submissionAttempts:integer("submission_attempts").notNull().default(0), // requested | approved | processing | refunded | partially_refunded | failed | rejected | cancelled
  failureMessage: text("failure_message"),
  requestedBy: text("requested_by").notNull(),
  approvedBy: text("approved_by"),
  approvedAt: text("approved_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("uidx_booking_refunds_idempotency").on(table.idempotencyKey),
  index("idx_booking_refunds_booking").on(table.bookingReference),
]);

// Security and delivery state are separate from the 100-column bookings table.
export const staffAccounts = sqliteTable("staff_accounts", {
 id:text("id").primaryKey(), username:text("username").notNull().unique(), email:text("email").notNull(), displayName:text("display_name").notNull(), passwordHash:text("password_hash").notNull(), role:text("role").notNull(), mfaSecret:text("mfa_secret"), lastTotpStep:integer("last_totp_step").notNull().default(-1), active:integer("active").notNull().default(1), createdAt:text("created_at").notNull(),
});
export const staffSessions = sqliteTable("staff_sessions", {
 tokenHash:text("token_hash").primaryKey(), staffId:text("staff_id").notNull().references(()=>staffAccounts.id), expiresAt:text("expires_at").notNull(), lastUsedAt:text("last_used_at").notNull(), revokedAt:text("revoked_at"), createdAt:text("created_at").notNull(),
},t=>[index("staff_sessions_staff").on(t.staffId)]);
export const staffChallenges = sqliteTable("staff_challenges", {
 tokenHash:text("token_hash").primaryKey(), staffId:text("staff_id").notNull().references(()=>staffAccounts.id), enrollmentSecret:text("enrollment_secret"), attempts:integer("attempts").notNull().default(0), expiresAt:text("expires_at").notNull(), consumedAt:text("consumed_at"),
});
export const securityRateWindows = sqliteTable("security_rate_windows", {
 fingerprint:text("fingerprint").notNull(), window:integer("window").notNull(), attempts:integer("attempts").notNull(),
},t=>[primaryKey({columns:[t.fingerprint,t.window]})]);
export const tripAccessSessions = sqliteTable("trip_access_sessions", {
 tokenHash:text("token_hash").primaryKey(), bookingReference:text("booking_reference").notNull().references(()=>bookings.reference), access:text("access").notNull(), issuedAt:integer("issued_at").notNull(), expiresAt:text("expires_at").notNull(),
});
export const bookingPolicySnapshots = sqliteTable("booking_policy_snapshots", {
 bookingReference:text("booking_reference").primaryKey().references(()=>bookings.reference), version:text("version").notNull(), policyJson:text("policy_json").notNull(), acceptedAt:text("accepted_at").notNull(),
});
export const bookingDeliveries = sqliteTable("booking_deliveries", {
 id:text("id").primaryKey(), bookingReference:text("booking_reference").notNull().references(()=>bookings.reference), channel:text("channel").notNull(), recipient:text("recipient"), status:text("status").notNull().default("pending"), attempts:integer("attempts").notNull().default(0), attemptedAt:text("attempted_at"), nextAttemptAt:text("next_attempt_at"), sentAt:text("sent_at"), lastError:text("last_error"), createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull(),
},t=>[index("booking_delivery_pending").on(t.status,t.nextAttemptAt)]);
export const websiteConversations = sqliteTable("website_conversations", {
 id:text("id").primaryKey(), tokenHash:text("token_hash").notNull().unique(), expiresAt:text("expires_at").notNull(), createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull(),
});
export const websiteChatMessages = sqliteTable("website_chat_messages", {
 id:text("id").primaryKey(), conversationId:text("conversation_id").notNull().references(()=>websiteConversations.id), sender:text("sender").notNull(), body:text("body").notNull(), staffId:text("staff_id").references(()=>staffAccounts.id), createdAt:text("created_at").notNull(),
},t=>[index("chat_conversation_time").on(t.conversationId,t.createdAt)]);

// Smart Trip Planner: reusable attraction data, supplier contacts and planned trips.
export const suppliers = sqliteTable("suppliers", {
 id:text("id").primaryKey(), name:text("name").notNull(), kind:text("kind").notNull().default("attraction"),
 contactName:text("contact_name"), phone:text("phone"), lineId:text("line_id"), whatsapp:text("whatsapp"), email:text("email"), notes:text("notes"),
 createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull(),
});
export const attractions = sqliteTable("attractions", {
 id:text("id").primaryKey(), name:text("name").notNull(), customerName:text("customer_name"), area:text("area").notNull().default(""),
 address:text("address"), latitude:real("latitude"), longitude:real("longitude"), googlePlaceId:text("google_place_id"), category:text("category").notNull().default("sight"),
 tagsJson:text("tags_json").notNull().default("[]"), openTime:text("open_time"), closeTime:text("close_time"), lastEntry:text("last_entry"),
 closedDaysJson:text("closed_days_json").notNull().default("[]"), durationMin:integer("duration_min").notNull().default(60),
 arrivalBufferMin:integer("arrival_buffer_min").notNull().default(0), bookingRequired:integer("booking_required",{mode:"boolean"}).notNull().default(false),
 weatherSensitive:integer("weather_sensitive",{mode:"boolean"}).notNull().default(false), dressCode:text("dress_code"), description:text("description"),
 highlightsJson:text("highlights_json").notNull().default("[]"), bringJson:text("bring_json").notNull().default("[]"),
 coverImage:text("cover_image"), galleryJson:text("gallery_json").notNull().default("[]"), imageCredit:text("image_credit"), website:text("website"), phone:text("phone"),
 internalNotes:text("internal_notes"), supplierId:text("supplier_id").references(()=>suppliers.id),
 programsJson:text("programs_json").notNull().default("[]"), exceptionsJson:text("exceptions_json").notNull().default("[]"),
 status:text("status").notNull().default("active"), verifiedAt:text("verified_at"), verifiedBy:text("verified_by"),
 mealSlotsJson:text("meal_slots_json").notNull().default("[]"), priceLevel:integer("price_level"), avgSpend:integer("avg_spend"), neighbourhood:text("neighbourhood"),
 bestTime:text("best_time"), vibesJson:text("vibes_json").notNull().default("[]"), dropoffNote:text("dropoff_note"), reservationNote:text("reservation_note"),
 shortLine:text("short_line"), published:integer("published",{mode:"boolean"}).notNull().default(false), i18nJson:text("i18n_json").notNull().default("{}"), seedKey:text("seed_key"),
 createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull(),
},t=>[index("attractions_area").on(t.area,t.status),uniqueIndex("attractions_seed_key").on(t.seedKey)]);
export const smartTrips = sqliteTable("smart_trips", {
 id:text("id").primaryKey(), ref:text("ref").notNull().unique(), status:text("status").notNull().default("draft"),
 title:text("title").notNull(), area:text("area").notNull().default(""), tripDate:text("trip_date"), startTime:text("start_time").notNull().default("08:00"),
 pickupText:text("pickup_text").notNull().default(""), pickupLat:real("pickup_lat"), pickupLng:real("pickup_lng"),
 endText:text("end_text"), endLat:real("end_lat"), endLng:real("end_lng"), durationHours:integer("duration_hours").notNull().default(8),
 adults:integer("adults").notNull().default(2), children:integer("children").notNull().default(0), bags:integer("bags").notNull().default(0),
 vehicle:text("vehicle").notNull().default("comfort_suv"), language:text("language").notNull().default("en"),
 customerName:text("customer_name"), customerEmail:text("customer_email"), customerPhone:text("customer_phone"), notes:text("notes"),
 stopsJson:text("stops_json").notNull().default("[]"), transportPrice:integer("transport_price").notNull().default(0),
 feesTotal:integer("fees_total").notNull().default(0), discount:integer("discount").notNull().default(0), total:integer("total").notNull().default(0),
 token:text("token").notNull().unique(), isTemplate:integer("is_template",{mode:"boolean"}).notNull().default(false), templateName:text("template_name"),
 agencyId:text("agency_id"), commissionPercent:integer("commission_percent").notNull().default(0), createdBy:text("created_by"),
 snapshotJson:text("snapshot_json"), version:integer("version").notNull().default(0), sentAt:text("sent_at"), viewedAt:text("viewed_at"), acceptedAt:text("accepted_at"),
 changeRequest:text("change_request"), bookingReference:text("booking_reference"), thankedAt:text("thanked_at"),
 feedbackRating:integer("feedback_rating"), feedbackComment:text("feedback_comment"), feedbackAt:text("feedback_at"),
 packageId:text("package_id"), commissionPaidAt:text("commission_paid_at"), holdDays:integer("hold_days").notNull().default(7), groupId:text("group_id"), dayNumber:integer("day_number").notNull().default(1), dayCheckedAt:text("day_checked_at"),
 createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull(),
},t=>[index("smart_trips_status").on(t.isTemplate,t.status,t.tripDate),index("smart_trips_booking").on(t.bookingReference),index("smart_trips_group").on(t.groupId,t.dayNumber)]);
export const smartTripVersions = sqliteTable("smart_trip_versions", {
 id:text("id").primaryKey(), tripId:text("trip_id").notNull().references(()=>smartTrips.id), version:integer("version").notNull(),
 snapshotJson:text("snapshot_json").notNull(), note:text("note"), createdBy:text("created_by"), createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("smart_trip_version_unique").on(t.tripId,t.version)]);

// Sellable day-trip packages shown on city pages, built from a smart-trip template.
export const tripPackages = sqliteTable("trip_packages", {
 id:text("id").primaryKey(), slug:text("slug").notNull().unique(), city:text("city").notNull(), templateId:text("template_id").notNull().references(()=>smartTrips.id),
 name:text("name").notNull(), kind:text("kind").notNull().default("half_day"), summary:text("summary"), highlightsJson:text("highlights_json").notNull().default("[]"),
 includedJson:text("included_json").notNull().default("[]"), excludedJson:text("excluded_json").notNull().default("[]"), startTimesJson:text("start_times_json").notNull().default('["08:00"]'),
 coverImage:text("cover_image"), pricesJson:text("prices_json").notNull().default("{}"), minNoticeHours:integer("min_notice_hours").notNull().default(24), published:integer("published",{mode:"boolean"}).notNull().default(false),
 sortOrder:integer("sort_order").notNull().default(0), i18nJson:text("i18n_json").notNull().default("{}"), createdAt:text("created_at").notNull(), updatedAt:text("updated_at").notNull(),
},t=>[index("trip_packages_city").on(t.city,t.published,t.sortOrder)]);

// Staff-only CRM records; contact consolidation does not alter account ownership.
export const crmContacts = sqliteTable("crm_contacts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  memberId: text("member_id"),
  ownerId: text("owner_id"),
  language: text("language").notNull().default("en"),
  notes: text("notes").notNull().default(""),
  marketingOptIn: integer("marketing_opt_in").notNull().default(0),
  consentAt: text("consent_at"),
  consentSource: text("consent_source"),
  mergedInto: text("merged_into"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const crmSources = sqliteTable("crm_sources", {
  kind: text("kind").notNull(),
  sourceId: text("source_id").notNull(),
  contactId: text("contact_id").notNull(),
}, t => [primaryKey({columns:[t.kind,t.sourceId]})]);
export const crmLeads = sqliteTable("crm_leads", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").notNull(),
  title: text("title").notNull(),
  stage: text("stage").notNull().default("new"),
  valueMinor: integer("value_minor").notNull().default(0),
  ownerId: text("owner_id"),
  source: text("source").notNull().default("manual"),
  bookingReference: text("booking_reference"),
  lossReason: text("loss_reason"),
  version: integer("version").notNull().default(0),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const crmTasks = sqliteTable("crm_tasks", {
  id: text("id").primaryKey(),
  contactId: text("contact_id"),
  leadId: text("lead_id"),
  conversationId: text("conversation_id"),
  title: text("title").notNull(),
  dueAt: text("due_at").notNull(),
  ownerId: text("owner_id").notNull(),
  status: text("status").notNull().default("open"),
  completedAt: text("completed_at"),
  remindedAt: text("reminded_at"),
  dedupeKey: text("dedupe_key").unique(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const crmEvents = sqliteTable("crm_events", {
  id: text("id").primaryKey(),
  contactId: text("contact_id"),
  entityId: text("entity_id"),
  kind: text("kind").notNull(),
  body: text("body").notNull(),
  staffId: text("staff_id"),
  createdAt: text("created_at").notNull(),
});
export const crmQuotes = sqliteTable("crm_quotes", {
  id: text("id").primaryKey(),
  contactId: text("contact_id").notNull(),
  leadId: text("lead_id"),
  version: integer("version").notNull().default(1),
  status: text("status").notNull().default("draft"),
  title: text("title").notNull(),
  pickup: text("pickup").notNull(),
  dropoff: text("dropoff").notNull(),
  tripDate: text("trip_date").notNull(),
  tripTime: text("trip_time").notNull(),
  vehicle: text("vehicle").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  expiresAt: text("expires_at").notNull(),
  tokenHash: text("token_hash").unique(),
  formToken: text("form_token"),
  bookingReference: text("booking_reference"),
  acceptedAt: text("accepted_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const crmQuoteVersions = sqliteTable("crm_quote_versions", {
  quoteId: text("quote_id").notNull(),
  version: integer("version").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  staffId: text("staff_id"),
  createdAt: text("created_at").notNull(),
}, t => [primaryKey({columns:[t.quoteId,t.version]})]);
export const agencyMembers = sqliteTable("agency_members", {
  agencyId: text("agency_id").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("booker"),
  active: integer("active").notNull().default(1),
  createdAt: text("created_at").notNull(),
}, t => [primaryKey({columns:[t.agencyId,t.email]})]);
export const crmPartnerAccounts = sqliteTable("crm_partner_accounts", {
  agencyId: text("agency_id").primaryKey(),
  ownerId: text("owner_id"),
  rateNotes: text("rate_notes").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});
export const crmRetentionRules = sqliteTable("crm_retention_rules", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind").notNull(),
  days: integer("days").notNull(),
  enabled: integer("enabled").notNull().default(0),
  ownerId: text("owner_id").notNull(),
  message: text("message").notNull().default(""),
  channel: text("channel").notNull().default("task"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});
export const crmOutbox = sqliteTable("crm_outbox", {
  id: text("id").primaryKey(),
  contactId: text("contact_id"),
  ruleId: text("rule_id"),
  dedupeKey: text("dedupe_key").notNull().unique(),
  email: text("email").notNull(),
  payloadJson: text("payload_json").notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  attemptedAt: text("attempted_at"),
  firstAttemptAt: text("first_attempt_at"),
  nextAttemptAt: text("next_attempt_at"),
  sentAt: text("sent_at"),
  createdAt: text("created_at").notNull(),
});
export const crmSyncState = sqliteTable("crm_sync_state", {
  id: text("id").primaryKey(),
  lastRunAt: text("last_run_at"),
});

export const crmMarketingTokens=sqliteTable("crm_marketing_tokens",{tokenHash:text("token_hash").primaryKey(),contactId:text("contact_id").notNull().references(()=>crmContacts.id),expiresAt:text("expires_at").notNull(),createdAt:text("created_at").notNull()});

// Assignment-scoped GPS camera evidence. Status links are enforced by migration triggers.
export const driverEvidencePolicy = sqliteTable("driver_evidence_policy", {
 id:integer("id").primaryKey(), pickupRequired:integer("pickup_required").notNull().default(0), dropoffRequired:integer("dropoff_required").notNull().default(0), gpsRequired:integer("gps_required").notNull().default(0), gpsTimeoutMs:integer("gps_timeout_ms").notNull().default(20000), maxAccuracyM:integer("max_accuracy_m").notNull().default(2000), retentionDays:integer("retention_days").notNull().default(30), updatedBy:text("updated_by"), updatedAt:text("updated_at"),
});
export const driverTripEvidence = sqliteTable("driver_trip_evidence", {
 id:text("id").primaryKey(), assignmentId:text("assignment_id").notNull().references(()=>bookingAssignments.id), bookingReference:text("booking_reference").notNull(), leg:text("leg").notNull(), driverId:text("driver_id").notNull(), eventType:text("event_type").notNull(), statusEventId:text("status_event_id").unique().references(()=>driverStatusEvents.id), deviceCapturedAt:text("device_captured_at").notNull(), receivedAt:text("received_at").notNull(), confirmedAt:text("confirmed_at"), latitude:real("latitude"), longitude:real("longitude"), accuracyMetres:real("accuracy_metres"), originalKey:text("original_key").notNull(), stampedKey:text("stamped_key").notNull(), fileBytes:integer("file_bytes").notNull(), expiresAt:text("expires_at").notNull(), deletedAt:text("deleted_at"),
},t=>[uniqueIndex("uidx_trip_evidence_assignment_id").on(t.assignmentId,t.id),index("idx_trip_evidence_assignment").on(t.assignmentId,t.receivedAt),index("idx_trip_evidence_expiry").on(t.expiresAt,t.deletedAt)]);
export const driverEvidenceOverrides = sqliteTable("driver_evidence_overrides", {
 assignmentId:text("assignment_id").notNull().references(()=>bookingAssignments.id), eventType:text("event_type").notNull(), reason:text("reason").notNull(), actor:text("actor").notNull(), createdAt:text("created_at").notNull(),
},t=>[uniqueIndex("uidx_driver_evidence_override").on(t.assignmentId,t.eventType)]);
export const driverEvidenceUploadLimits = sqliteTable("driver_evidence_upload_limits", {assignmentId:text("assignment_id").primaryKey(),windowStart:text("window_start").notNull(),attempts:integer("attempts").notNull()});
