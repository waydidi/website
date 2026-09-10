import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const bookings = sqliteTable(
  "bookings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    reference: text("reference").notNull().unique(),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    customerPhone: text("customer_phone").notNull().default(""),
    pickup: text("pickup").notNull(),
    dropoff: text("dropoff").notNull(),
    pickupDate: text("pickup_date").notNull(),
    pickupTime: text("pickup_time").notNull(),
    passengers: integer("passengers").notNull(),
    luggage: integer("luggage").notNull(),
    flightNumber: text("flight_number"),
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
    paymentIntentId: text("payment_intent_id"),
    refundId: text("refund_id"),
    cancelledAt: text("cancelled_at"),
    termsAcceptedAt: text("terms_accepted_at"),
    policyVersion: text("policy_version"),
    accessTokenHash: text("access_token_hash").notNull(),
    pdfKey: text("pdf_key"),
    emailStatus: text("email_status").notNull().default("pending"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    fareQuoteId: text("fare_quote_id"),
    pricingArea: text("pricing_area"),
    routeDistanceMeters: integer("route_distance_meters"),
    routeDurationSeconds: integer("route_duration_seconds"),
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
  },
  (table) => [
    index("idx_bookings_email").on(table.customerEmail),
    index("idx_bookings_status").on(table.status),
    index("idx_bookings_pickup_date_status").on(table.pickupDate, table.status),
  ],
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
    pickupLatitude: real("pickup_latitude"),
    pickupLongitude: real("pickup_longitude"),
    dropoffLatitude: real("dropoff_latitude"),
    dropoffLongitude: real("dropoff_longitude"),
    vehiclePricesJson: text("vehicle_prices_json").notNull(),
    pricingVersion: integer("pricing_version").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("idx_fare_quotes_expires_at").on(table.expiresAt)],
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
  },
  (table) => [
    index("idx_assignments_booking_active").on(table.bookingReference, table.revokedAt),
    index("idx_assignments_driver_status").on(table.driverId, table.currentStatus),
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
