import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => vite.close());

const { checkoutInputSchema } = await vite.ssrLoadModule(
  "/lib/booking-validation.ts",
);
const { requestIdFor, safeErrorCode } = await vite.ssrLoadModule(
  "/lib/observability.ts",
);
const { validateBookingReview } = await vite.ssrLoadModule(
  "/lib/booking-review.ts",
);
const { BOOKING_REFERENCE_ALPHABET, randomBookingReference, normalizeSurname } = await vite.ssrLoadModule(
  "/lib/booking-reference.ts",
);

function bangkokDateAfter(days) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(Date.now() + days * 86_400_000));
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

const outboundDate = bangkokDateAfter(30);
const returnDate = bangkokDateAfter(33);
const beforeOutboundDate = bangkokDateAfter(29);

const baseCheckout = {
  checkoutAttemptId: "f170fbb5-2a64-4fc0-b128-1835a871190d",
  customerName: "Test Passenger",
  customerSurname: "Passenger",
  customerEmail: "passenger@example.com",
  customerPhone: "+66 81 234 5678",
  pickup: "Suvarnabhumi Airport",
  dropoff: "Pattaya",
  pickupDate: outboundDate,
  pickupTime: "15:00",
  timezone: "Asia/Bangkok",
  passengers: 2,
  luggage: 2,
  vehicle: "comfort_suv",
  childSeats: 0,
  oversizedLuggage: false,
  termsAccepted: true,
  paymentMethod: "card",
  serviceType: "transfer",
  fareQuoteId: "64e93696-f2b7-4d2c-8357-f1e5300b85a8",
};

test("accepts a complete one-way transfer checkout", () => {
  assert.equal(checkoutInputSchema.safeParse(baseCheckout).success, true);
});

test("accepts a complete return transfer checkout", () => {
  const result = checkoutInputSchema.safeParse({
    ...baseCheckout,
    returnFareQuoteId: "4fe99227-871e-4fe0-a259-f20eb0d647ce",
    returnDate,
    returnTime: "10:30",
  });
  assert.equal(result.success, true);
});

test("rejects incomplete or chronologically invalid return trips", () => {
  const incomplete = checkoutInputSchema.safeParse({
    ...baseCheckout,
    returnDate,
  });
  assert.equal(incomplete.success, false);
  assert.equal(incomplete.error.issues[0].path[0], "returnFareQuoteId");

  const beforeOutbound = checkoutInputSchema.safeParse({
    ...baseCheckout,
    returnFareQuoteId: "4fe99227-871e-4fe0-a259-f20eb0d647ce",
    returnDate: beforeOutboundDate,
    returnTime: "10:30",
  });
  assert.equal(beforeOutbound.success, false);
  assert.ok(beforeOutbound.error.issues.some((issue) => issue.path[0] === "returnDate"));
});

test("requires an authoritative quote for hourly checkout", () => {
  const invalid = checkoutInputSchema.safeParse({
    ...baseCheckout,
    serviceType: "hourly",
    dropoff: "",
    bookedHours: 4,
    fareQuoteId: undefined,
  });
  assert.equal(invalid.success, false);
  assert.ok(invalid.error.issues.some((issue) => issue.path[0] === "hourlyQuoteId"));

  const valid = checkoutInputSchema.safeParse({
    ...baseCheckout,
    serviceType: "hourly",
    dropoff: "",
    bookedHours: 4,
    fareQuoteId: undefined,
    hourlyQuoteId: "8704c058-0fd6-44d1-8935-a76cad82d7e4",
  });
  assert.equal(valid.success, true);
});

test("rejects invalid checkout attempt IDs and unsupported vehicles", () => {
  assert.equal(
    checkoutInputSchema.safeParse({ ...baseCheckout, checkoutAttemptId: "crypto" }).success,
    false,
  );
  assert.equal(
    checkoutInputSchema.safeParse({ ...baseCheckout, vehicle: "unpriced_vehicle" }).success,
    false,
  );
});

test("keeps request IDs safe and normalizes provider failures", () => {
  const supplied = "booking-check-1234";
  assert.equal(
    requestIdFor(new Request("https://waydidi.test", { headers: { "x-request-id": supplied } })),
    supplied,
  );
  assert.notEqual(
    requestIdFor(new Request("https://waydidi.test", { headers: { "x-request-id": "bad id" } })),
    "bad id",
  );
  assert.equal(safeErrorCode(new Error("route lookup failed")), "ROUTE_LOOKUP_FAILED");
});

test("blocks review until passenger details and terms are valid", () => {
  const errors = validateBookingReview({
    name: "",
    surname: "",
    email: "not-an-email",
    phone: "12",
    termsAccepted: false,
  });
  assert.deepEqual(Object.keys(errors), ["name", "surname", "email", "phone", "termsAccepted"]);

  assert.deepEqual(
    validateBookingReview({
      name: "Test Passenger",
      surname: "Passenger",
      email: "passenger@example.com",
      phone: "+66 81 234 5678",
      termsAccepted: true,
    }),
    {},
  );
});

test("creates readable six-character booking references", () => {
  for (let index = 0; index < 100; index += 1) {
    const reference = randomBookingReference();
    assert.match(reference, /^[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(reference.length, 6);
    for (const character of reference) assert.ok(BOOKING_REFERENCE_ALPHABET.includes(character));
  }
  assert.equal(normalizeSurname("  D’Angelo  "), "d’angelo");
});
