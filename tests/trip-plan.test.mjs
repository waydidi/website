import assert from "node:assert/strict";
import test from "node:test";

const plan = await import("../lib/trip-plan.ts");
const { schedule, autoArrange, alternatives, sessionsOn, packingList, tripFees, toMin } = plan;

// A fixed travel time between any two different points keeps the arithmetic obvious.
const travel = (a, b) => (a.lat === b.lat && a.lng === b.lng ? 0 : 30);
const at = (lat) => ({ lat, lng: 100 });
const sanctuary = {
  id: "pes", name: "Elephant Sanctuary", latitude: 1, longitude: 100, openTime: "09:00", closeTime: "17:00", lastEntry: "16:00",
  closedDays: [], durationMin: 90, arrivalBufferMin: 15, tags: ["animal", "nature"], bring: ["Camera"], dressCode: null,
  programs: [{ id: "canopy", name: "Canopy Walkway", durationMin: 90, arrivalBufferMin: 15, feeAdult: 1000, feeChild: 500, feeIncluded: true,
    sessions: [{ time: "09:30" }, { time: "11:00", days: [1, 2, 3, 4, 5] }, { time: "13:30" }] }],
  exceptions: [{ from: "2027-04-13", to: "2027-04-14", closed: true }, { from: "2026-12-20", to: "2027-01-05", programId: "canopy", sessions: ["09:00", "10:30"] }],
};
const temple = { id: "wat", name: "Wat Chalong", latitude: 2, longitude: 100, openTime: "08:00", closeTime: "17:00", lastEntry: null, closedDays: [], durationMin: 45, arrivalBufferMin: 0, tags: ["temple"], programs: [], exceptions: [], dressCode: "Covered shoulders" };
const attractions = { pes: sanctuary, wat: temple };
const base = { date: "2026-10-07", startMin: toMin("08:00"), from: at(0), end: at(0), endLimit: toMin("18:00"), attractions, travel };
const canopy = { id: "s1", kind: "attraction", name: "Elephant Sanctuary", attractionId: "pes", programId: "canopy", sessionTime: "09:30", lat: 1, lng: 100, durationMin: 90, priority: "fixed" };
const wat = { id: "s2", kind: "attraction", name: "Wat Chalong", attractionId: "wat", lat: 2, lng: 100, durationMin: 45, priority: "must" };

test("a fixed session waits for its start and leaves after the program", () => {
  const p = schedule([canopy], base);
  const s = p.stops[0];
  assert.equal(s.arrival, toMin("08:30"));
  assert.equal(s.start, toMin("09:30"));
  assert.equal(s.end, toMin("11:00"));
  assert.equal(p.returnAt, toMin("11:30"));
  assert.equal(p.problems.filter((x) => x.level === "error").length, 0);
});

test("arriving after the check-in time is an error, not a silent shift", () => {
  const p = schedule([canopy], { ...base, startMin: toMin("09:00") });
  assert.match(p.stops[0].problems[0].message, /after the 09:15 check-in/);
});

test("weekday sessions, holiday closures and temporary schedules", () => {
  assert.deepEqual(sessionsOn(sanctuary, sanctuary.programs[0], "2026-10-07"), ["09:30", "11:00", "13:30"]); // Wednesday
  assert.deepEqual(sessionsOn(sanctuary, sanctuary.programs[0], "2026-10-10"), ["09:30", "13:30"]); // Saturday
  assert.deepEqual(sessionsOn(sanctuary, sanctuary.programs[0], "2027-04-13"), []);
  assert.deepEqual(sessionsOn(sanctuary, sanctuary.programs[0], "2026-12-25"), ["09:00", "10:30"]);
  const p = schedule([{ ...canopy, sessionTime: "11:00" }], { ...base, date: "2026-10-10" });
  assert.ok(p.problems.some((x) => /no 11:00 session/.test(x.message)));
});

test("auto-arrange keeps the anchor and fits the flexible stop around it", () => {
  const order = autoArrange([wat, canopy], base);
  assert.deepEqual(order.map((s) => s.id), ["s1", "s2"]);
  const p = schedule(order, base);
  assert.equal(p.problems.filter((x) => x.level === "error").length, 0);
});

test("nice-to-have stops that would break the trip are skipped, not forced in", () => {
  const long = { ...wat, id: "s3", name: "Long tour", priority: "nice", durationMin: 600, attractionId: undefined, lat: 3 };
  const order = autoArrange([canopy, long], base);
  assert.equal(order.find((s) => s.id === "s3").skipped, true);
});

test("an over-long trip offers removals, shortening and an extension", () => {
  const p = schedule([canopy, { ...wat, durationMin: 420 }], base);
  assert.ok(p.overBy > 0);
  const alts = alternatives([canopy, { ...wat, durationMin: 420 }], base);
  assert.ok(alts.some((a) => a.label.startsWith("Remove Wat Chalong") && a.fits));
  assert.ok(alts.at(-1).extendHours >= 1);
  assert.ok(!alts.some((a) => a.label.includes("Elephant")), "fixed sessions are never suggested for removal");
});

test("fees and the packing list come from the stops", () => {
  assert.deepEqual(tripFees([canopy], attractions, 2, 1), { included: 2500, onSite: 0 });
  const items = packingList([canopy, wat], attractions, 300);
  assert.ok(items.some((i) => /shoulders and knees/.test(i)));
  assert.ok(items.includes("Camera"));
  assert.ok(items.some((i) => /Cash for entrance fees \(about THB 300\)/.test(i)));
});
