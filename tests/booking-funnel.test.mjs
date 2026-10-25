import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { createServer } from "vite";
import { migrationStatements } from "./helpers/migrations.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: "2026-05-22", d1Databases: ["DB", "BOOTSTRAP", "LEGACY"] });
const db = await mf.getD1Database("DB"), bootstrap = await mf.getD1Database("BOOTSTRAP"), legacy = await mf.getD1Database("LEGACY");
for (const name of (await readdir(root + "/drizzle")).filter(name => name.endsWith(".sql")).sort()) {
  const statements = migrationStatements(await readFile(root + "/drizzle/" + name, "utf8")).map(sql => sql.trim()).filter(Boolean);
  if (statements.length) await db.batch(statements.map(sql => db.prepare(sql)));
}
globalThis.__funnelEnv = { DB: db, BOOKING_FUNNEL_ENABLED: "1", RATE_LIMIT_SALT: "local-test-only-salt-at-least-32-characters" };
globalThis.__funnelAdmin = { role: "owner" };
const vite = await createServer({ root, configFile: false, appType: "custom", resolve: { alias: { "@": root } }, server: { middlewareMode: true }, plugins: [{
  name: "funnel-boundaries", enforce: "pre",
  resolveId(id) { if (id === "cloudflare:workers") return "\0funnel-env"; if (id.endsWith("/lib/admin")) return "\0funnel-admin"; },
  load(id) { if (id === "\0funnel-env") return "export const env=globalThis.__funnelEnv"; if (id === "\0funnel-admin") return "export async function getWaydidiAdmin(){return globalThis.__funnelAdmin}"; },
}] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__funnelEnv; delete globalThis.__funnelAdmin; });
const data = await vite.ssrLoadModule("/lib/booking-funnel-db.ts");
const rules = await vite.ssrLoadModule("/lib/booking-funnel-rules.ts");
const privacy = await vite.ssrLoadModule("/lib/privacy-consent.ts");
const route = await vite.ssrLoadModule("/app/api/funnel/route.ts");
const reportRoute = await vite.ssrLoadModule("/app/api/admin/reports/funnel/route.ts");
const secret = globalThis.__funnelEnv.RATE_LIMIT_SALT;
const event = (stage = "quote", journeyId = crypto.randomUUID(), service = "transfer") => ({ journeyId, eventId: crypto.randomUUID(), stage, service });
const request = (body, headers = {}, method = "POST") => new Request("https://example.invalid/api/funnel", { method, headers: { origin: "https://example.invalid", "content-type": "application/json", cookie: "waydidi_consent=analytics", "cf-connecting-ip": crypto.randomUUID(), ...headers }, body: JSON.stringify(body) });
const total = async () => (await db.prepare("SELECT (SELECT COUNT(*) FROM booking_funnel_events)+(SELECT COUNT(*) FROM booking_funnel_tour_events) AS n").first()).n;

test("consent parsing fails closed and never admits dynamic private paths", () => {
  for (const cookie of ["", "waydidi_consent=%", "waydidi_consent=analytics; waydidi_consent=necessary", "waydidi_consent=analytics,unknown"]) assert.equal(privacy.permitsAnalytics(cookie), false);
  assert.equal(privacy.permitsAnalytics("other=1;waydidi_consent=functional%2Canalytics"), true);
  assert.equal(privacy.permitsAnalytics("waydidi_consent=analytics", "1"), false);
  assert.equal(privacy.permitsAnalytics("waydidi_consent=analytics", null, true), false);
  for (const path of ["/pay/SECRET", "/booking/confirmation/ABCDEF", "/itinerary/TOKEN", "/account", "/driver", "/blog/customer@example.invalid", "/?token=SECRET"]) assert.equal(privacy.publicAnalyticsPath(path), null);
  assert.equal(privacy.publicAnalyticsPath("/"), "/");
  assert.equal(rules.funnelDateRange("2026-13-99", "2026-10-25"), null);
  assert.equal(rules.funnelDateRange("2026-02-30", "2026-03-05"), null);
  assert.equal(rules.funnelDateRange("2026-01-01", "2026-10-25"), null);
  assert.deepEqual(rules.funnelDateRange("2026-10-25", "2026-10-25"), { start: "2026-10-24T17:00:00.000Z", end: "2026-10-25T17:00:00.000Z" });
});

test("public measurement requires consent, enabled configuration, origin, and a strict non-PII payload", async () => {
  const before = await total(), valid = event();
  for (const headers of [{ cookie: "" }, { dnt: "1" }, { "sec-gpc": "1" }]) assert.equal((await route.POST(request(valid, headers))).status, 204);
  globalThis.__funnelEnv.BOOKING_FUNNEL_ENABLED = "0";
  assert.equal((await route.POST(request(valid))).status, 204);
  globalThis.__funnelEnv.BOOKING_FUNNEL_ENABLED = "1";
  assert.equal((await route.POST(request(valid, { origin: "https://attacker.invalid" }))).status, 403);
  for (const body of [{ ...valid, email: "private@example.invalid" }, { ...valid, url: "https://example.invalid/?token=secret" }, { ...valid, stage: "confirmed" }, { ...valid, service: "unknown" }]) assert.equal((await route.POST(request(body))).status, 400);
  assert.equal(await total(), before);
});

test("concurrent replay and alternate event IDs deduplicate each journey stage without storing raw journey IDs", async () => {
  const input = event(), before = await total();
  await Promise.all(Array.from({ length: 8 }, () => data.recordFunnelEvent(db, secret, input)));
  await data.recordFunnelEvent(db, secret, { ...input, eventId: crypto.randomUUID() });
  await data.recordFunnelEvent(db, secret, { ...input, eventId: crypto.randomUUID(), service: "hourly", stage: "payment" });
  await data.recordFunnelEvent(db, secret, { ...input, journeyId: crypto.randomUUID(), service: "tour" });
  assert.equal(await total(), before + 1);
  const row = await db.prepare("SELECT * FROM booking_funnel_events WHERE event_id=?").bind(input.eventId).first();
  assert.match(row.journey_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(row).includes(input.journeyId), false);
});

async function booking(reference, status = "pending_payment") {
  const now = new Date().toISOString();
  await db.prepare("INSERT INTO bookings(reference,customer_name,customer_email,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,payment_status,status,access_token_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(reference, "Private traveller", "private@example.invalid", "Private pickup", "Private dropoff", "2027-01-01", "10:00", 1, 0, "economy_sedan", "cash", 1000, "cash_due", status, "PRIVATE_TOKEN", now, now).run();
}

test("confirmation requires a real committed booking and remains deduplicated when linking races fulfillment", async () => {
  const input = event(); await data.recordFunnelEvent(db, secret, input); await booking("FN0001");
  await data.linkFunnelBooking(db, secret, input.journeyId, "FN0001", "transfer");
  const before = await total();
  await data.confirmFunnelBooking(db, secret, "FN0001"); assert.equal(await total(), before);
  await db.prepare("UPDATE bookings SET status='confirmed' WHERE reference='FN0001'").run();
  await Promise.all([data.confirmFunnelBooking(db, secret, "FN0001"), data.linkFunnelBooking(db, secret, input.journeyId, "FN0001", "transfer")]);
  assert.equal(await total(), before + 1);
  const rows = (await db.prepare("SELECT * FROM booking_funnel_links").all()).results;
  assert.equal(JSON.stringify(rows).includes("FN0001"), false);
  assert.equal(JSON.stringify(rows).includes("private@example.invalid"), false);
  await booking("FN0002", "confirmed");
  const next = event(); await data.recordFunnelEvent(db, secret, next);
  await data.confirmFunnelBooking(db, secret, "FN0002");
  const beforeLink = await total(); await data.linkFunnelBooking(db, secret, next.journeyId, "FN0002", "transfer");
  assert.equal(await total(), beforeLink + 1);
});

test("withdrawal deletes active events and links and prevents later events or confirmation from restoring them", async () => {
  const input = event(); await data.recordFunnelEvent(db, secret, input); await booking("FN0003", "confirmed");
  await data.linkFunnelBooking(db, secret, input.journeyId, "FN0003", "transfer");
  const before = await total();
  globalThis.__funnelEnv.BOOKING_FUNNEL_ENABLED = "0";
  assert.equal((await route.DELETE(request({ journeyId: input.journeyId }, { cookie: "waydidi_consent=necessary" }, "DELETE"))).status, 204);
  globalThis.__funnelEnv.BOOKING_FUNNEL_ENABLED = "1";
  assert.equal(await total(), before - 2);
  await Promise.all([data.recordFunnelEvent(db, secret, event("payment", input.journeyId)), data.linkFunnelBooking(db, secret, input.journeyId, "FN0003", "transfer"), data.confirmFunnelBooking(db, secret, "FN0003")]);
  assert.equal(await total(), before - 2);
});

test("report uses quote cohorts and sequential observations rather than inventing missing stages", async () => {
  const first = event(), second = event(), at = "2026-10-01T18:00:00.000Z";
  await data.recordFunnelEvent(db, secret, first, at);
  await data.recordFunnelEvent(db, secret, event("payment", first.journeyId), at);
  await data.recordFunnelEvent(db, secret, second, at);
  await data.recordFunnelEvent(db, secret, event("details", second.journeyId), at);
  await data.recordFunnelEvent(db, secret, event("payment", second.journeyId), at);
  const report = await data.funnelReport(db, "2026-10-01T17:00:00.000Z", "2026-10-02T17:00:00.000Z", "all");
  assert.deepEqual(report, { quote: 2, details: 1, payment: 1, confirmed: 0, incomplete: 1 });
  assert.equal((await data.funnelReport(db, "2026-10-01T17:00:00.000Z", "2026-10-02T17:00:00.000Z", "hourly")).quote, 0);
});

test("aggregate report checks roles independently of the Worker gate and validates dates", async () => {
  const req = new Request("https://example.invalid/api/admin/reports/funnel?from=2026-10-01&to=2026-10-25");
  globalThis.__funnelAdmin = null; assert.equal((await reportRoute.GET(req)).status, 401);
  for (const role of ["operations", "support", "editor"]) { globalThis.__funnelAdmin = { role }; assert.equal((await reportRoute.GET(req)).status, 403); }
  for (const role of ["owner", "finance"]) { globalThis.__funnelAdmin = { role }; const response = await reportRoute.GET(req); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); assert.deepEqual(Object.keys(await response.json()).sort(), ["counts", "enabled"]); }
  assert.equal((await reportRoute.GET(new Request("https://example.invalid/api/admin/reports/funnel?from=bad&to=bad"))).status, 400);
});

test("runtime bootstrap and migration match, and retention removes whole expired journeys and old opt-outs", async () => {
  await data.ensureBookingFunnel(bootstrap); await data.ensureBookingFunnel(bootstrap);
  const migrated = (await db.prepare("SELECT name,sql FROM sqlite_master WHERE name LIKE 'booking_funnel_%' ORDER BY name").all()).results;
  const boot = (await bootstrap.prepare("SELECT name,sql FROM sqlite_master WHERE name LIKE 'booking_funnel_%' ORDER BY name").all()).results;
  assert.deepEqual(boot, migrated);
  const old = event(); await data.recordFunnelEvent(db, secret, old, "2020-01-01T00:00:00.000Z");
  await data.recordFunnelEvent(db, secret, event("payment", old.journeyId));
  const before = await total();
  await data.forgetFunnel(db, secret, crypto.randomUUID(), "2020-01-01T00:00:00.000Z");
  await data.purgeBookingFunnel(db);
  assert.equal(await total(), before - 2);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM booking_funnel_optouts WHERE created_at<'2021'").first()).n, 0);
});

test("additive tour bootstrap preserves existing schemas and records, rolls back failure and supports repeated migration", async () => {
  const initial = migrationStatements(await readFile(root + "/drizzle/0111_booking_funnel.sql", "utf8")).map(sql => sql.trim()).filter(Boolean);
  await legacy.batch(initial.map(sql => legacy.prepare(sql)));
  const id = crypto.randomUUID(), at = new Date().toISOString(), journey = "a".repeat(64);
  await legacy.batch([
    legacy.prepare("INSERT INTO booking_funnel_events VALUES(?,?,'quote','transfer',?)").bind(id, journey, at),
    legacy.prepare("INSERT INTO booking_funnel_links VALUES(?,?,'transfer',?)").bind("b".repeat(64), journey, at),
    legacy.prepare("INSERT INTO booking_funnel_optouts VALUES(?,?)").bind("c".repeat(64), at),
  ]);
  const snapshot = async () => Promise.all(["events", "links", "optouts"].map(async table => (await legacy.prepare("SELECT * FROM booking_funnel_" + table).all()).results));
  const before = await snapshot();
  const beforeSchema = (await legacy.prepare("SELECT name,sql FROM sqlite_master WHERE name IN ('booking_funnel_events','booking_funnel_links','booking_funnel_optouts') ORDER BY name").all()).results;
  await legacy.prepare("CREATE VIEW booking_funnel_tour_links AS SELECT '' AS booking_hash,'' AS journey_hash,'tour' AS service,'' AS created_at").run();
  await assert.rejects(data.ensureBookingFunnel(legacy), /view/i);
  assert.equal((await legacy.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name='booking_funnel_tour_events'").first()).n, 0, 'failed initialization rolls back its new tables');
  assert.deepEqual(await snapshot(), before);
  await legacy.prepare("DROP VIEW booking_funnel_tour_links").run();
  await Promise.all([data.ensureBookingFunnel(legacy), data.ensureBookingFunnel(legacy)]);
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual((await legacy.prepare("SELECT name,sql FROM sqlite_master WHERE name IN ('booking_funnel_events','booking_funnel_links','booking_funnel_optouts') ORDER BY name").all()).results, beforeSchema);
  const migration = migrationStatements(await readFile(root + "/drizzle/0112_booking_funnel_tours.sql", "utf8")).map(sql => sql.trim()).filter(Boolean);
  await legacy.batch(migration.map(sql => legacy.prepare(sql)));
  await legacy.batch(migration.map(sql => legacy.prepare(sql)));
  assert.deepEqual(await snapshot(), before);
  await data.recordFunnelEvent(legacy, secret, event("quote", crypto.randomUUID(), "tour"));
  assert.equal((await legacy.prepare("SELECT COUNT(*) AS n FROM booking_funnel_tour_events").first()).n, 1);
  await legacy.batch(migration.map(sql => legacy.prepare(sql)));
  assert.equal((await legacy.prepare("SELECT COUNT(*) AS n FROM booking_funnel_tour_events").first()).n, 1);
  assert.deepEqual(await snapshot(), before);
});

test("tour checkout retries can link multiple attempts to one journey but confirmation stays unique", async () => {
  const input = event("quote", crypto.randomUUID(), "tour");
  assert.equal((await route.POST(request(input))).status, 204);
  await data.recordFunnelEvent(db, secret, event("details", input.journeyId, "tour"));
  await data.recordFunnelEvent(db, secret, event("payment", input.journeyId, "tour"));
  await booking("FN0004", "confirmed"); await booking("FN0005", "confirmed");
  await db.prepare("UPDATE bookings SET service_type='tour',payment_method='card',payment_status='paid' WHERE reference IN ('FN0004','FN0005')").run();
  await data.linkFunnelBooking(db, secret, input.journeyId, "FN0004", "tour");
  await data.linkFunnelBooking(db, secret, input.journeyId, "FN0005", "tour");
  const before = await total();
  await data.confirmFunnelBooking(db, secret, "FN0004"); await data.confirmFunnelBooking(db, secret, "FN0005");
  assert.equal(await total(), before);
  const report = await data.funnelReport(db, "2020-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z", "tour");
  assert.deepEqual(report, { quote: 1, details: 1, payment: 1, confirmed: 1, incomplete: 0 });
  const response = await reportRoute.GET(new Request("https://example.invalid/api/admin/reports/funnel?from=2026-10-01&to=2026-10-25&service=tour"));
  assert.equal(response.status, 200);
  await db.prepare("CREATE TRIGGER test_tour_withdraw_failure BEFORE DELETE ON booking_funnel_tour_links BEGIN SELECT RAISE(ABORT,'simulated withdrawal failure'); END").run();
  await assert.rejects(data.forgetFunnel(db, secret, input.journeyId), /simulated withdrawal failure/);
  assert.equal((await data.funnelReport(db, "2020-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z", "tour")).confirmed, 1, 'a failed withdrawal leaves its entire transaction retryable');
  await db.prepare("DROP TRIGGER test_tour_withdraw_failure").run();
  await data.forgetFunnel(db, secret, input.journeyId);
  await data.confirmFunnelBooking(db, secret, "FN0004");
  assert.equal((await data.funnelReport(db, "2020-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z", "tour")).confirmed, 0);
  const expired = event("quote", crypto.randomUUID(), "tour");
  await data.recordFunnelEvent(db, secret, expired, "2020-01-01T00:00:00.000Z");
  await data.recordFunnelEvent(db, secret, event("payment", expired.journeyId, "tour"));
  await data.purgeBookingFunnel(db);
  assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM booking_funnel_tour_events").first()).n, 0);
});

test("a temporarily missing hashing secret cannot falsely acknowledge a withdrawal", async () => {
  const input = event(); await data.recordFunnelEvent(db, secret, input);
  const before = await total();
  const configuredSecret = globalThis.__funnelEnv.RATE_LIMIT_SALT;
  try {
    delete globalThis.__funnelEnv.RATE_LIMIT_SALT;
    assert.equal((await route.DELETE(request({ journeyId: input.journeyId }, { cookie: "" }, "DELETE"))).status, 503);
    assert.equal(await total(), before);
  } finally { globalThis.__funnelEnv.RATE_LIMIT_SALT = configuredSecret; }
  assert.equal((await route.DELETE(request({ journeyId: input.journeyId }, { cookie: "" }, "DELETE"))).status, 204);
  assert.equal(await total(), before - 1);
});
