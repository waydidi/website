import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { createServer } from "vite";
import { migrationStatements } from "./helpers/migrations.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: "2026-05-22", d1Databases: ["DB", "LEGACY"] });
const db = await mf.getD1Database("DB"), legacy = await mf.getD1Database("LEGACY");
for (const name of (await readdir(root + "/drizzle")).filter(name => name.endsWith(".sql")).sort()) {
  const statements = migrationStatements(await readFile(root + "/drizzle/" + name, "utf8")).map(sql => sql.trim()).filter(Boolean);
  if (statements.length) {
    await db.batch(statements.map(sql => db.prepare(sql)));
    if (name < "0110_") await legacy.batch(statements.map(sql => legacy.prepare(sql)));
  }
}
globalThis.__customerChangeEnv = { DB: db };
globalThis.__changeNotifications = 0;
const vite = await createServer({ root, configFile: false, appType: "custom", resolve: { alias: { "@": root } }, server: { middlewareMode: true }, plugins: [{
  name: "customer-change-boundaries", enforce: "pre",
  resolveId(id) {
    if (id === "cloudflare:workers") return "\0change-env";
    if (id.endsWith("/lib/booking-quote-check")) return "\0change-pricing";
    if (id.endsWith("/lib/telegram/booking-changes")) return "\0change-notify";
  },
  load(id) {
    if (id === "\0change-env") return "export const env=globalThis.__customerChangeEnv";
    if (id === "\0change-pricing") return "export async function validTransferPrice(quote){return quote.expiresAt>new Date().toISOString()}";
    if (id === "\0change-notify") return "export async function notifyChangeRequest(){globalThis.__changeNotifications++;return true}";
  },
}] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__customerChangeEnv; delete globalThis.__changeNotifications; });
const route = await vite.ssrLoadModule("/app/api/bookings/manage/change-request/route.ts");
const historyRoute = await vite.ssrLoadModule("/app/api/bookings/manage/change-history/route.ts");
const history = await vite.ssrLoadModule("/lib/booking-change-history.ts");
const { getDb } = await vite.ssrLoadModule("/db/index.ts");
const schema = await vite.ssrLoadModule("/db/schema.ts");
const { sha256 } = await vite.ssrLoadModule("/lib/security.ts");
let sequence = 0;
async function seed() {
  const reference = "CC" + String(++sequence).padStart(4, "2");
  const at = new Date().toISOString(), date = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await getDb().insert(schema.bookings).values({ reference, customerName: "Private Traveller", customerEmail: "private@example.invalid", pickup: "Old pickup", dropoff: "Old dropoff", pickupDate: date, pickupTime: "10:00", passengers: 1, luggage: 1, vehicle: "economy_sedan", paymentMethod: "cash", total: 1200, outboundTotal: 1000, amountPaid: 0, paymentStatus: "cash_due", status: "confirmed", accessTokenHash: "test-only", createdAt: at, updatedAt: at });
  const token = crypto.randomUUID();
  await getDb().insert(schema.bookingManagementSessions).values({ id: crypto.randomUUID(), bookingReference: reference, tokenHash: await sha256(token), expiresAt: new Date(Date.now() + 900000).toISOString(), createdAt: at, lastUsedAt: at });
  const quoteId = crypto.randomUUID();
  await getDb().insert(schema.fareQuotes).values({ id: quoteId, areaId: "test-only", areaName: "Test", pickupPlaceId: "new-a", dropoffPlaceId: "new-b", pickupText: "New pickup", dropoffText: "New dropoff", departureDate: date, departureTime: "11:00", distanceMeters: 10000, durationSeconds: 1200, vehiclePricesJson: JSON.stringify({ economy_sedan: { total: 1400 } }), pricingVersion: 1, timezone: "Asia/Bangkok", expiresAt: new Date(Date.now() + 1800000).toISOString(), createdAt: at });
  return { reference, token, body: { fareQuoteId: quoteId, vehicleId: "economy_sedan", bookingVersion: 1, requestId: crypto.randomUUID(), expectedRevisedTotalMinor: 160000 } };
}
const request = (fixture, body = fixture.body) => new Request("https://example.invalid/api/bookings/manage/change-request", { method: "POST", headers: { origin: "https://example.invalid", "content-type": "application/json", cookie: "waydidi_manage=" + fixture.token }, body: JSON.stringify(body) });
const historyRequest = (fixture, query = "") => new Request("https://example.invalid/api/bookings/manage/change-history" + query, { headers: { cookie: "waydidi_manage=" + fixture.token } });

test("preview retains add-ons and discounts without creating a request or changing the booking", async () => {
  const fixture = await seed();
  const before = globalThis.__changeNotifications;
  const response = await route.POST(request(fixture, { ...fixture.body, preview: true }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { originalTotalMinor: 120000, revisedTotalMinor: 160000, priceDifferenceMinor: 40000, bookingVersion: 1 });
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM booking_change_requests WHERE booking_reference=?").bind(fixture.reference).first()).n, 0);
  assert.equal((await db.prepare("SELECT total FROM bookings WHERE reference=?").bind(fixture.reference).first()).total, 1200);
  assert.equal(globalThis.__changeNotifications, before);
});

test("submission rejects an accepted total that differs from the server preview", async () => {
  const fixture = await seed();
  assert.equal((await route.POST(request(fixture, { ...fixture.body, expectedRevisedTotalMinor: 140000 }))).status, 409);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM booking_change_requests WHERE booking_reference=?").bind(fixture.reference).first()).n, 0);
});

test("identical concurrent requests create one pending change, alert and history event", async () => {
  const fixture = await seed(), before = globalThis.__changeNotifications;
  const responses = await Promise.all([route.POST(request(fixture)), route.POST(request(fixture))]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  const bodies = await Promise.all(responses.map(r => r.json()));
  assert.equal(bodies.filter(r => r.reused).length, 1);
  for (const table of ["booking_change_requests", "operations_alerts", "booking_change_history"]) assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE booking_reference=?`).bind(fixture.reference).first()).n, 1);
  assert.equal(globalThis.__changeNotifications, before + 1);
  assert.equal((await route.POST(request(fixture, { ...fixture.body, reason: "Different details" }))).status, 409);
});

test("competing request IDs cannot occupy the same pending slot", async () => {
  const fixture = await seed();
  const results = await Promise.all([route.POST(request(fixture)), route.POST(request(fixture, { ...fixture.body, requestId: crypto.randomUUID() }))]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM booking_change_requests WHERE booking_reference=? AND status='pending'").bind(fixture.reference).first()).n, 1);
});

test("stale booking versions and expired quotes cannot submit", async () => {
  const fixture = await seed();
  await db.prepare("UPDATE bookings SET booking_version=2 WHERE reference=?").bind(fixture.reference).run();
  assert.equal((await route.POST(request(fixture))).status, 409);
  const expired = await seed();
  await db.prepare("UPDATE fare_quotes SET expires_at='2020-01-01T00:00:00.000Z' WHERE id=?").bind(expired.body.fareQuoteId).run();
  assert.equal((await route.POST(request(expired))).status, 409);
});

test("failed alert recording rolls back the request and its history before a safe retry", async () => {
  const fixture = await seed();
  await db.prepare(`CREATE TRIGGER fail_change_alert BEFORE INSERT ON operations_alerts WHEN NEW.booking_reference='${fixture.reference}' BEGIN SELECT RAISE(ABORT,'simulated alert failure'); END`).run();
  assert.equal((await route.POST(request(fixture))).status, 503);
  for (const table of ["booking_change_requests", "booking_change_history"]) assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE booking_reference=?`).bind(fixture.reference).first()).n, 0);
  await db.prepare("DROP TRIGGER fail_change_alert").run();
  assert.equal((await route.POST(request(fixture))).status, 200);
});

test("history is scoped to the management session and records immutable decisions", async () => {
  const fixture = await seed(), other = await seed();
  assert.equal((await route.POST(request(fixture))).status, 200);
  await db.prepare("UPDATE booking_change_requests SET status='declined',resolved_at=? WHERE id=?").bind(new Date().toISOString(), fixture.body.requestId).run();
  const response = await historyRoute.GET(historyRequest(fixture));
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.deepEqual(body.events.map(event => event.status), ["declined", "submitted"]);
  assert.ok(body.events.every(event => event.originalMinor === 120000 && event.revisedMinor === 160000 && event.differenceMinor === 40000));
  assert.equal((await (await historyRoute.GET(historyRequest(other))).json()).events.length, 0);
  assert.equal((await historyRoute.GET(historyRequest(other, "?reference=" + fixture.reference))).status, 400);
  assert.equal((await historyRoute.GET(new Request("https://example.invalid/api/bookings/manage/change-history"))).status, 401);
  assert.equal((await route.POST(request({ ...fixture, token: "not-a-session" }))).status, 401);
  await assert.rejects(() => db.prepare("UPDATE booking_change_history SET revised_minor=0 WHERE request_id=?").bind(fixture.body.requestId).run(), /append-only/);
  await assert.rejects(() => db.prepare("DELETE FROM booking_change_history WHERE request_id=?").bind(fixture.body.requestId).run(), /append-only/);
  assert.equal((await route.POST(request(fixture))).status, 200); // retry returns the existing declined result
  assert.equal((await (await route.POST(request(fixture))).json()).status, "declined");
});

test("runtime history bootstrap backfills legacy submitted and resolved snapshots once", async () => {
  const fixture = await seed();
  await route.POST(request(fixture));
  const record = await db.prepare("SELECT * FROM booking_change_requests WHERE id=?").bind(fixture.body.requestId).first();
  const keys = Object.keys(record), placeholders = keys.map(() => "?").join(",");
  await legacy.prepare(`INSERT INTO booking_change_requests(${keys.join(",")}) VALUES(${placeholders})`).bind(...keys.map(key => key === "status" ? "approved" : record[key])).run();
  await history.ensureBookingChangeHistory(legacy);
  await history.ensureBookingChangeHistory(legacy);
  const result = await history.bookingChangeHistory(legacy, fixture.reference, 0);
  assert.equal(result.events.length, 2);
  assert.deepEqual(result.events.map(event => event.status), ["approved", "submitted"]);
});

test("all customer history remains accessible through bounded pages", async () => {
  const fixture = await seed();
  await route.POST(request(fixture));
  const record = await db.prepare("SELECT * FROM booking_change_requests WHERE id=?").bind(fixture.body.requestId).first();
  await db.prepare("UPDATE booking_change_requests SET status='declined',resolved_at=? WHERE id=?").bind(new Date().toISOString(), fixture.body.requestId).run();
  const keys = Object.keys(record), placeholders = keys.map(() => "?").join(",");
  for (let index = 0; index < 10; index++) {
    const id = crypto.randomUUID();
    await db.prepare(`INSERT INTO booking_change_requests(${keys.join(",")}) VALUES(${placeholders})`).bind(...keys.map(key => key === "id" ? id : record[key])).run();
    await db.prepare("UPDATE booking_change_requests SET status='declined',resolved_at=? WHERE id=?").bind(new Date().toISOString(), id).run();
  }
  const first = await (await historyRoute.GET(historyRequest(fixture))).json();
  const second = await (await historyRoute.GET(historyRequest(fixture, "?offset=20"))).json();
  assert.equal(first.events.length, 20); assert.equal(first.hasMore, true);
  assert.equal(second.events.length, 2); assert.equal(second.hasMore, false);
  assert.ok(second.events.every(event => !first.events.some(item => item.id === event.id)));
  for (const offset of ["-1", "1", "NaN"]) assert.equal((await historyRoute.GET(historyRequest(fixture, "?offset=" + offset))).status, 400);
});
