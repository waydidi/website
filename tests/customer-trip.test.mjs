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

const rules = await vite.ssrLoadModule("/lib/customer-trip-rules.ts");
const HOUR = 60 * 60 * 1000;
const at = (iso) => new Date(iso).getTime();

test("driver steps map to the customer timeline", () => {
  const cases = [
    ["confirmed", undefined, "confirmed"],
    ["confirmed", "assigned", "assigned"],
    ["confirmed", "going_to_standby", "on_the_way"],
    ["confirmed", "standby", "waiting"],
    ["confirmed", "passenger_verified", "waiting"],
    ["confirmed", "trip_started", "on_trip"],
    ["confirmed", "passenger_picked_up", "on_trip"],
    ["confirmed", "completed", "arrived"],
    ["completed", "completed", "arrived"],
    ["confirmed", "no_show", "no_show"],
    ["no_show", "no_show", "no_show"],
    ["cancelled", "going_to_standby", "cancelled"],
  ];
  for (const [booking, driver, expected] of cases) assert.equal(rules.customerStage(booking, driver), expected, `${booking}/${driver}`);
});

test("the car is only visible on the way and during the ride", () => {
  const visible = ["confirmed", "assigned", "on_the_way", "waiting", "on_trip", "arrived", "no_show", "cancelled"].filter(rules.locationVisible);
  assert.deepEqual(visible, ["on_the_way", "on_trip"]);
  assert.equal(rules.etaTarget("on_the_way"), "pickup");
  assert.equal(rules.etaTarget("on_trip"), "dropoff");
  assert.equal(rules.etaTarget("waiting"), null);
});

test("stale driver positions are not shown as live", () => {
  const now = at("2026-10-01T05:00:00Z");
  assert.ok(rules.freshLocation({ serverTimestamp: "2026-10-01T04:55:00Z" }, now));
  assert.equal(rules.freshLocation({ serverTimestamp: "2026-10-01T04:49:00Z" }, now), null);
  assert.equal(rules.freshLocation(null, now), null);
});

test("ETA lookups are cached for two minutes", () => {
  assert.equal(rules.ETA_CACHE_SECONDS, 120);
});

const booking = { pickupDate: "2026-10-01", pickupTime: "10:00", routeDurationSeconds: 2 * 3600, serviceType: "transfer" };
const pickup = at("2026-10-01T10:00:00+07:00");

test("share links last until 2 hours after the scheduled end", () => {
  assert.equal(rules.scheduledTripEnd(booking), pickup + 2 * HOUR);
  assert.ok(rules.shareLinkActive({ booking, stage: "assigned", now: pickup + 4 * HOUR - 1 }));
  assert.equal(rules.shareLinkActive({ booking, stage: "assigned", now: pickup + 4 * HOUR + 1 }), false);
  assert.equal(rules.scheduledTripEnd({ ...booking, serviceType: "hourly", bookedHours: 6 }), pickup + 6 * HOUR);
});

test("share links count from drop-off once the driver has finished", () => {
  const completedAt = new Date(pickup + HOUR).toISOString();
  assert.ok(rules.shareLinkActive({ booking, stage: "arrived", completedAt, now: pickup + 3 * HOUR - 1 }));
  assert.equal(rules.shareLinkActive({ booking, stage: "arrived", completedAt, now: pickup + 3 * HOUR + 1 }), false);
});

test("share links keep working while a late trip is still in progress, and never for cancelled trips", () => {
  assert.ok(rules.shareLinkActive({ booking, stage: "on_trip", now: pickup + 10 * HOUR }));
  assert.equal(rules.shareLinkActive({ booking, stage: "cancelled", now: pickup - HOUR }), false);
});

test("share tokens parse and stop working after a revoke", () => {
  const issuedAt = at("2026-10-01T02:00:00Z");
  const parsed = rules.parseShareToken(`${issuedAt.toString(36)}.${"a1".repeat(16)}`);
  assert.deepEqual(parsed, { issuedAt, signature: "a1".repeat(16) });
  assert.equal(rules.parseShareToken("nope"), null);
  assert.equal(rules.parseShareToken(`${issuedAt.toString(36)}.${"z".repeat(32)}`), null);
  assert.ok(rules.shareIssuedAfterRevoke(issuedAt, null));
  assert.ok(rules.shareIssuedAfterRevoke(issuedAt, "2026-10-01T01:59:00Z"));
  assert.equal(rules.shareIssuedAfterRevoke(issuedAt, "2026-10-01T02:00:00Z"), false);
});
