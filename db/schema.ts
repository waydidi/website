import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    amountExpected: integer("amount_expected").notNull(),
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
    bookedHours: integer("booked_hours").notNull(),
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
