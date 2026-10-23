import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";
import { fileURLToPath } from "node:url";

// Multi-day smart trips: which places go on which day (no AI, no database).
const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ root, configFile: false, appType: "custom", resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(() => vite.close());
const { splitIntoDays, shareByWeight, MAX_TRIP_DAYS } = await vite.ssrLoadModule("/lib/trip-split.ts");
const { toMin } = await vite.ssrLoadModule("/lib/trip-plan.ts");

// Drive time: 20 minutes per 0.1 degree, so places at the same spot are next to each other.
const travel = (a, b) => Math.round((Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng)) * 200);
const hotel = { lat: 8, lng: 98 };
const place = (id, lat, lng, durationMin = 180, extra = {}) => ({ id, kind: "attraction", name: id, attractionId: id, lat, lng, durationMin, priority: "must", ...extra });
const data = (id, extra = {}) => ({ id, name: id, latitude: 0, longitude: 0, openTime: "08:00", closeTime: "20:00", lastEntry: null, closedDays: [], durationMin: 60, arrivalBufferMin: 0, programs: [], exceptions: [], tags: [], ...extra });
const base = (stops, extra = {}) => ({ startDate: "2026-11-02", startMin: toMin("08:00"), hours: 8, from: hotel, end: hotel, travel,
  attractions: Object.fromEntries(stops.map((s) => [s.id, data(s.id)])), ...extra });
const names = (r) => r.days.map((d) => d.stops.map((s) => s.id).sort());
const allPlaces = (r) => r.days.flatMap((d) => d.stops.map((s) => s.id)).sort();

test("places that fit one day stay on one day", () => {
  const stops = [place("a", 8.01, 98), place("b", 8.02, 98)];
  const r = splitIntoDays(stops, base(stops));
  assert.equal(r.fits, true);
  assert.deepEqual(names(r), [["a", "b"]]);
});

test("too many places for one day: as few days as fit, every place kept, each day inside its hours", () => {
  const stops = ["a", "b", "c", "d", "e"].map((id, i) => place(id, 8 + i * 0.01, 98));
  const r = splitIntoDays(stops, base(stops));
  assert.equal(r.fits, true);
  assert.equal(r.days.length, 3, "5 places of 3 hours need 3 days of 8 hours");
  assert.deepEqual(allPlaces(r), ["a", "b", "c", "d", "e"]);
  for (const d of r.days) { assert.equal(d.plan.overBy, 0); assert.ok(d.hours <= 8 && d.hours >= 1); }
  assert.deepEqual(r.days.map((d) => d.date), ["2026-11-02", "2026-11-03", "2026-11-04"]);
});

test("places close together share a day: two areas give two days, not a zig-zag", () => {
  const north = [place("n1", 9, 98, 150), place("n2", 9.01, 98, 150)], south = [place("s1", 7, 98, 150), place("s2", 7.01, 98, 150)];
  const stops = [north[0], south[0], north[1], south[1]];
  const r = splitIntoDays(stops, base(stops, { hours: 12 }));
  assert.equal(r.fits, true);
  assert.deepEqual(names(r).sort(), [["n1", "n2"], ["s1", "s2"]]);
});

test("a place closed on a day's date goes on another day", () => {
  // 2026-11-02 is a Monday; the museum closes on Mondays.
  const stops = [place("museum", 8.01, 98, 240), place("temple", 8.02, 98, 240), place("market", 8.03, 98, 240)];
  const b = base(stops); b.attractions.museum = data("museum", { closedDays: [1] });
  const r = splitIntoDays(stops, b);
  assert.equal(r.fits, true);
  assert.ok(!r.days[0].stops.some((s) => s.id === "museum"), "not on Monday");
  assert.deepEqual(allPlaces(r), ["market", "museum", "temple"]);
});

test("the customer's number of days and a place pinned to a day are kept", () => {
  const stops = [place("a", 8.01, 98, 60), place("b", 8.02, 98, 60), place("c", 8.03, 98, 60)];
  const r = splitIntoDays(stops, base(stops), { days: 3, pinned: { a: 2 } });
  assert.equal(r.days.length, 3);
  assert.ok(r.days[2].stops.some((s) => s.id === "a"), "a stays on day 3");
  assert.deepEqual(allPlaces(r), ["a", "b", "c"]);
});

test("a day is never planned longer than 12 hours, and a trip never has more than 15 days", () => {
  const stops = [place("a", 8.01, 98, 600), place("b", 8.02, 98, 600)];
  const r = splitIntoDays(stops, base(stops, { hours: 16 }));
  assert.equal(r.days.length, 2, "two 10-hour visits do not fit one 12-hour day");
  for (const d of r.days) assert.equal(d.plan.endLimit - d.plan.startAt, 12 * 60);
  const many = Array.from({ length: 40 }, (_, i) => place(`p${i}`, 8 + i * 0.01, 98, 420));
  const big = splitIntoDays(many, base(many));
  assert.equal(big.days.length, MAX_TRIP_DAYS);
  assert.equal(big.fits, false, "staff see that it is still over");
  assert.equal(allPlaces(big).length, 40, "no place is dropped");
});

test("option A: the transport price is shared by each day's weight and always adds up exactly", () => {
  assert.deepEqual(shareByWeight(12000, [1, 1, 1]), [4000, 4000, 4000]);
  assert.deepEqual(shareByWeight(10000, [3000, 2000]), [6000, 4000]);
  assert.deepEqual(shareByWeight(10000, [1, 1, 1]), [3334, 3333, 3333]);
  assert.deepEqual(shareByWeight(5000, [0, 0]), [2500, 2500], "no rates: equal parts");
  assert.deepEqual(shareByWeight(0, [2, 1]), [0, 0]);
  for (const [amount, weights] of [[12345, [3500, 4200, 2800]], [7, [1, 1, 1, 1]], [99999, [1, 2, 3, 4, 5, 6]]])
    assert.equal(shareByWeight(amount, weights).reduce((a, b) => a + b, 0), amount);
});
