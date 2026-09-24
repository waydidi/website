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

const rules = await vite.ssrLoadModule("/lib/trip-rules.ts");
const MINUTE = 60_000;
const at = (iso) => new Date(iso).getTime();

test("steps run in order and passenger_picked_up is only a legacy route to completion", () => {
  const chain = ["assigned"];
  while (rules.NEXT_DRIVER_STATUS[chain.at(-1)]) chain.push(rules.NEXT_DRIVER_STATUS[chain.at(-1)]);
  assert.deepEqual(chain, ["assigned", "going_to_standby", "standby", "passenger_verified", "trip_started", "completed"]);
  assert.equal(rules.NEXT_DRIVER_STATUS.passenger_picked_up, "completed");
  assert.equal(rules.NEXT_DRIVER_STATUS.no_show, undefined);
  assert.equal(rules.NEXT_DRIVER_STATUS.completed, undefined);
});

test("every step after assigned needs GPS except PIN verification", () => {
  for (const status of ["going_to_standby", "standby", "trip_started", "completed", "no_show"]) assert.ok(rules.locationRequired(status), status);
  assert.equal(rules.locationRequired("passenger_verified"), false);
  assert.equal(rules.locationRequired("assigned"), false);
});

test("no-show needs a photo and admin review", () => {
  assert.ok(rules.evidenceRequired("no_show"));
  assert.ok(rules.adminReviewRequired("no_show"));
  assert.equal(rules.adminReviewRequired("trip_started"), false);
});

test("trip start and no-show are compared with the pickup point, drop-off with the drop-off point", () => {
  assert.equal(rules.expectedPointFor("trip_started"), "pickup");
  assert.equal(rules.expectedPointFor("no_show"), "pickup");
  assert.equal(rules.expectedPointFor("standby"), "pickup");
  assert.equal(rules.expectedPointFor("completed"), "dropoff");
  assert.equal(rules.expectedPointFor("going_to_standby"), null);
});

test("no-show opens 30 minutes after pickup time away from airports", () => {
  const booking = { pickup: "Sukhumvit Soi 11, Bangkok", pickupDate: "2026-10-01", pickupTime: "10:00" };
  assert.equal(rules.isAirportPickup(booking), false);
  assert.equal(rules.noShowEligibleAt(booking), at("2026-10-01T10:30:00+07:00"));
});

test("airport no-show opens 90 minutes after landing, using the latest flight estimate", () => {
  const booking = {
    pickup: "Suvarnabhumi Airport (BKK)", pickupDate: "2026-10-01", pickupTime: "10:00", flightNumber: "TG 661",
    flightScheduledArrival: "2026-10-01T03:00:00Z", flightEstimatedArrival: "2026-10-01T04:15:00Z",
  };
  assert.ok(rules.isAirportPickup(booking));
  assert.equal(rules.noShowEligibleAt(booking), at("2026-10-01T04:15:00Z") + 90 * MINUTE);
  assert.equal(rules.noShowEligibleAt({ ...booking, flightEstimatedArrival: null }), at("2026-10-01T03:00:00Z") + 90 * MINUTE);
});

test("airport no-show falls back to pickup time without flight data and never opens before pickup", () => {
  const noFlight = { pickup: "Don Mueang International Airport", pickupDate: "2026-10-01", pickupTime: "10:00" };
  assert.equal(rules.noShowEligibleAt(noFlight), at("2026-10-01T10:00:00+07:00") + 90 * MINUTE);
  const earlyLanding = { ...noFlight, flightNumber: "FD 3101", flightScheduledArrival: "2026-10-01T00:00:00Z" };
  assert.equal(rules.noShowEligibleAt(earlyLanding), at("2026-10-01T10:00:00+07:00"));
});

test("Thai and Chinese airport names count as airports", () => {
  assert.ok(rules.isAirportPickup({ pickup: "ท่าอากาศยานสุวรรณภูมิ สนามบิน", flightNumber: null }));
  assert.ok(rules.isAirportPickup({ pickup: "普吉国际机场", flightNumber: null }));
  assert.ok(rules.isAirportPickup({ pickup: "HKT arrivals", flightNumber: "" }));
  assert.equal(rules.isAirportPickup({ pickup: "Hilton Hotel", flightNumber: "  " }), false);
});

test("no-show must be reported within 2 km of pickup", () => {
  const pickup = { latitude: 13.69, longitude: 100.75 };
  assert.equal(rules.NO_SHOW_MAX_DISTANCE_METRES, 2000);
  assert.ok(rules.distanceMetres(pickup, { latitude: 13.70, longitude: 100.75 }) < 2000);
  assert.ok(rules.distanceMetres(pickup, { latitude: 13.72, longitude: 100.75 }) > 2000);
});

test("offline replay accepts the real tap time within six hours and in order", () => {
  const now = at("2026-10-01T05:00:00Z");
  assert.equal(rules.acceptedOccurredAt(undefined, now, null), "2026-10-01T05:00:00.000Z");
  assert.equal(rules.acceptedOccurredAt("2026-10-01T04:10:00Z", now, at("2026-10-01T04:00:00Z")), "2026-10-01T04:10:00.000Z");
  assert.equal(rules.acceptedOccurredAt("2026-10-01T03:50:00Z", now, at("2026-10-01T04:00:00Z")), null, "before the previous step");
  assert.equal(rules.acceptedOccurredAt("2026-09-30T22:00:00Z", now, null), null, "older than six hours");
  assert.equal(rules.acceptedOccurredAt("2026-10-01T05:10:00Z", now, null), null, "in the future");
  assert.equal(rules.acceptedOccurredAt("2026-10-01T05:01:00Z", now, null), "2026-10-01T05:00:00.000Z", "small clock drift is clamped");
  assert.equal(rules.acceptedOccurredAt("not a date", now, null), null);
});

test("hotel pickups need the driver waiting 30 minutes before pickup time", () => {
  const booking = { pickup: "Hilton Pattaya", pickupDate: "2026-10-01", pickupTime: "10:00" };
  assert.equal(rules.standbyDeadline(booking), at("2026-10-01T09:30:00+07:00"));
});

test("airport pickups need the driver waiting 10 minutes after landing", () => {
  const booking = {
    pickup: "Suvarnabhumi Airport (BKK)", pickupDate: "2026-10-01", pickupTime: "10:00", flightNumber: "TG 661",
    flightScheduledArrival: "2026-10-01T02:30:00Z", flightEstimatedArrival: "2026-10-01T03:05:00Z",
  };
  assert.equal(rules.standbyDeadline(booking), at("2026-10-01T03:05:00Z") + 10 * MINUTE);
  assert.equal(rules.standbyDeadline({ ...booking, flightEstimatedArrival: null }), at("2026-10-01T02:30:00Z") + 10 * MINUTE);
  assert.equal(rules.standbyDeadline({ ...booking, flightScheduledArrival: null, flightEstimatedArrival: null }), at("2026-10-01T10:00:00+07:00"), "no flight data: the booked pickup time");
});
