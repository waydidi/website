import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const { liveStatus } = await vite.ssrLoadModule("/lib/trip-live.ts");

const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
// Bangkok wall-clock time today → Date.
const at = (hhmm) => new Date(`${today}T${hhmm}:00+07:00`);
const stop = (id, name, start, end, lat, extra = {}) => ({ id, kind: "attraction", name, arrival: start, start, end, travelMin: 20, program: null, sessionTime: null, checkIn: null, lat, lng: 98.3, note: null, description: null, highlights: [], cover: null, gallery: [], dressCode: null, openHours: null, fee: null, ...extra });
// Stops ~10 km apart along a line (lat step 0.09°).
const snap = {
  version: 1, createdAt: "", ref: "TP-1", title: "Test day", tripDate: today, startTime: "08:00", pickupText: "Hotel", pickup: { lat: 7.8, lng: 98.3 },
  endText: "Hotel", end: null, durationHours: 10, adults: 2, children: 0, vehicle: "comfort_suv", vehicleName: "SUV", customerName: "A", language: "en", notes: null,
  stops: [
    stop("a", "Viewpoint", 8 * 60 + 30, 9 * 60 + 30, 7.89),
    stop("b", "Canopy Walk", 11 * 60, 12 * 60 + 30, 7.98, { sessionTime: "11:00", checkIn: 10 * 60 + 45, program: "Canopy" }),
    stop("c", "Old Town", 13 * 60, 14 * 60 + 30, 8.07),
  ],
  returnAt: 15 * 60 + 30, returnTravel: 60, totalDrive: 120, transportPrice: 0, feesIncluded: 0, feesOnSite: 0, discount: 0, total: 0, packing: [],
};

test("before pickup and on another day", () => {
  assert.equal(liveStatus(snap, at("07:00"), null).state, "before");
  assert.equal(liveStatus({ ...snap, tripDate: "2001-01-01" }, at("10:00"), null).state, "not_today");
});

test("on time: at the first stop, next is the session", () => {
  const l = liveStatus(snap, at("09:00"), { lat: 7.8901, lng: 98.3, updatedAt: "" });
  assert.equal(l.state, "live");
  assert.equal(l.current?.id, "a");
  assert.equal(l.next?.id, "b");
  assert.equal(l.risks.length, 0);
});

test("running late at the first stop puts the fixed session at risk and suggests leaving early", () => {
  const late = { ...snap, stops: snap.stops.map((s) => (s.id === "a" ? { ...s, end: 10 * 60 + 40 } : s)) };
  const l = liveStatus(late, at("10:20"), { lat: 7.8901, lng: 98.3, updatedAt: "" });
  assert.equal(l.stops.find((s) => s.id === "b").status, "at_risk");
  assert.ok(l.risks.some((r) => /check-in for the 11:00 session/.test(r)));
  assert.ok(l.suggestions.some((s) => s.kind === "shorten" && s.stopId === "a" && s.fixes), JSON.stringify(l.suggestions));
  assert.ok(!l.suggestions.some((s) => s.stopId === "b"), "the fixed session itself is never suggested for skipping");
});

test("skipped stops stay skipped and are not visited", () => {
  const l = liveStatus(snap, at("12:40"), { lat: 7.9801, lng: 98.3, updatedAt: "" }, ["c"]);
  assert.equal(l.stops.find((s) => s.id === "c").status, "skipped");
  assert.equal(l.next, null);
});
