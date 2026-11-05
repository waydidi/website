import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { createServer } from "vite";
import { migrationStatements } from "./helpers/migrations.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: "2026-05-22", d1Databases: ["DB", "BOOTSTRAP"] });
const db = await mf.getD1Database("DB"), bootstrap = await mf.getD1Database("BOOTSTRAP");
for (const name of (await readdir(root + "/drizzle")).filter(name => name.endsWith(".sql")).sort()) {
  const statements = migrationStatements(await readFile(root + "/drizzle/" + name, "utf8")).map(sql => sql.trim()).filter(Boolean);
  if (statements.length) await db.batch(statements.map(sql => db.prepare(sql)));
}
globalThis.__monitoringEnv = { DB: db, WEB_MONITORING_ENABLED: "1", RATE_LIMIT_SALT: "local-test-only-salt-at-least-32-characters" };
globalThis.__monitoringAdmin = { role: "owner" };
const vite = await createServer({ root, configFile: false, appType: "custom", resolve: { alias: { "@": root } }, server: { middlewareMode: true }, plugins: [{
  name: "monitoring-boundaries", enforce: "pre",
  resolveId(id) { if (id === "cloudflare:workers") return "\0monitoring-env"; if (id.endsWith("/lib/admin")) return "\0monitoring-admin"; },
  load(id) { if (id === "\0monitoring-env") return "export const env=globalThis.__monitoringEnv"; if (id === "\0monitoring-admin") return "export async function getWaydidiAdmin(){return globalThis.__monitoringAdmin}"; },
}] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__monitoringEnv; delete globalThis.__monitoringAdmin; });
const rules = await vite.ssrLoadModule("/lib/web-monitoring-rules.ts");
const data = await vite.ssrLoadModule("/lib/web-monitoring-db.ts");
const route = await vite.ssrLoadModule("/app/api/web-monitoring/route.ts");
const reportRoute = await vite.ssrLoadModule("/app/api/admin/reports/web-monitoring/route.ts");

const vital = (over = {}) => ({ kind: "vital", route: "/", name: "LCP", value: 1200, device: "mobile", connection: "4g", ...over });
const failure = (over = {}) => ({ kind: "error", route: "/pay/[reference]", errorType: "TypeError", file: "chunk-abc.js", line: 1, column: 20, device: "mobile", ...over });
const request = (body, headers = {}) => new Request("https://example.invalid/api/web-monitoring", { method: "POST", headers: { origin: "https://example.invalid", "content-type": "application/json", cookie: "waydidi_consent=analytics", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const count = async () => (await db.prepare("SELECT (SELECT COUNT(*) FROM web_vital_events)+(SELECT COUNT(*) FROM web_error_events) AS n").first()).n;
const report = () => reportRoute.GET(new Request("https://example.invalid/api/admin/reports/web-monitoring?from=2020-01-01&to=2020-03-01"));

test("pages become route templates, and pages outside the list are not measured", () => {
  assert.equal(rules.monitoringRoute("/"), "/");
  assert.equal(rules.monitoringRoute("/th"), "/");
  assert.equal(rules.monitoringRoute("/th/transfers/bangkok-to-pattaya"), "/transfers/[slug]");
  assert.equal(rules.monitoringRoute("/transfers/city/phuket/"), "/transfers/city/[city]");
  assert.equal(rules.monitoringRoute("/pay/WD-SECRET"), "/pay/[reference]");
  assert.equal(rules.monitoringRoute("/booking/confirmation/WD-SECRET"), "/booking/confirmation/[reference]");
  assert.equal(rules.monitoringRoute("/itinerary/TOKEN"), "/itinerary/[token]");
  assert.equal(rules.monitoringRoute("/account/trips/WD-SECRET"), "/account");
  for (const path of ["/admin", "/admin/bookings", "/driver/trip/TOKEN", "/agency/trips/1", "/partner/1/KEY", "/f/TOKEN", "/s/shop", "/customer@example.invalid"]) assert.equal(rules.monitoringRoute(path), null, path);
});

test("error details keep only an allowed type and this site's script position", () => {
  assert.equal(rules.monitoringErrorType(new TypeError("customer@example.invalid not found")), "TypeError");
  const custom = new Error("secret"); custom.name = "customer@example.invalid";
  assert.equal(rules.monitoringErrorType(custom), "Other");
  assert.equal(rules.monitoringErrorType("customer@example.invalid"), "Other");
  assert.equal(rules.monitoringErrorFile("https://waydidi.test/assets/chunk-abc.js?token=SECRET", "https://waydidi.test"), "chunk-abc.js");
  assert.equal(rules.monitoringErrorFile("https://other.test/chunk.js", "https://waydidi.test"), null);
  assert.equal(rules.monitoringErrorFile("chrome-extension://abc/content.js", "https://waydidi.test"), null);
  assert.equal(rules.monitoringErrorFile("https://waydidi.test/pay/WD-SECRET", "https://waydidi.test"), null);
  assert.equal(rules.monitoringErrorFile(undefined, "https://waydidi.test"), null);
});

test("speed values are stored as bounded integers and rated", () => {
  assert.equal(rules.monitoringVitalValue("CLS", 0.123), 123);
  assert.equal(rules.monitoringVitalValue("LCP", 1234.6), 1235);
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -1, 600001]) assert.equal(rules.monitoringVitalValue("LCP", value), null);
  assert.equal(rules.vitalRating("LCP", 2500), "good");
  assert.equal(rules.vitalRating("LCP", 2501), "needs work");
  assert.equal(rules.vitalRating("CLS", 251), "poor");
});

test("collection needs the switch and a long enough salt", () => {
  assert.equal(rules.webMonitoringEnabled({}), false);
  assert.equal(rules.webMonitoringEnabled({ WEB_MONITORING_ENABLED: "1", RATE_LIMIT_SALT: "short" }), false);
  assert.equal(rules.webMonitoringEnabled({ WEB_MONITORING_ENABLED: "0", RATE_LIMIT_SALT: "x".repeat(32) }), false);
  assert.equal(rules.webMonitoringEnabled({ WEB_MONITORING_ENABLED: "1", RATE_LIMIT_SALT: "x".repeat(32) }), true);
});

test("nothing is stored without consent, with a privacy signal, or while switched off", async () => {
  const before = await count();
  assert.equal((await route.POST(request({ events: [vital()] }, { cookie: "" }))).status, 204);
  assert.equal((await route.POST(request({ events: [vital()] }, { cookie: "waydidi_consent=functional" }))).status, 204);
  assert.equal((await route.POST(request({ events: [vital()] }, { dnt: "1" }))).status, 204);
  assert.equal((await route.POST(request({ events: [vital()] }, { "sec-gpc": "1" }))).status, 204);
  globalThis.__monitoringEnv.WEB_MONITORING_ENABLED = "0";
  assert.equal((await route.POST(request({ events: [vital()] }))).status, 204);
  globalThis.__monitoringEnv.WEB_MONITORING_ENABLED = "1";
  assert.equal(await count(), before);
});

test("the public endpoint rejects other sites, oversized bodies and any personal data", async () => {
  const before = await count();
  assert.equal((await route.POST(request({ events: [vital()] }, { origin: "https://other.invalid" }))).status, 403);
  assert.equal((await route.POST(request({ events: [vital()] }, { "content-type": "text/plain" }))).status, 403);
  assert.equal((await route.POST(request("not json"))).status, 400);
  assert.equal((await route.POST(request("x".repeat(5000)))).status, 413);
  for (const body of [
    { events: [] },
    { events: Array.from({ length: 11 }, () => vital()) },
    { events: [vital()], visitor: "customer@example.invalid" },
    { events: [vital({ route: "/pay/WD-SECRET" })] },
    { events: [vital({ url: "https://waydidi.test/pay/WD-SECRET" })] },
    { events: [vital({ value: 1.5 })] },
    { events: [vital({ value: -1 })] },
    { events: [failure({ message: "customer@example.invalid" })] },
    { events: [failure({ stack: "at pay" })] },
    { events: [failure({ errorType: "customer@example.invalid" })] },
    { events: [failure({ file: "customer@example.invalid" })] },
    { events: [failure({ file: "../../secret.js" })] },
  ]) assert.equal((await route.POST(request(body))).status, 400, JSON.stringify(body));
  assert.equal(await count(), before);
});

test("rows hold no identifiers and times are cut to the hour", async () => {
  assert.equal((await route.POST(request({ events: [vital(), failure()] }))).status, 204);
  const columns = async table => (await db.prepare(`PRAGMA table_info(${table})`).all()).results.map(row => row.name);
  assert.deepEqual(await columns("web_vital_events"), ["id", "route", "name", "value", "device", "connection", "created_at"]);
  assert.deepEqual(await columns("web_error_events"), ["id", "route", "error_type", "file", "line", "col", "device", "created_at"]);
  const row = await db.prepare("SELECT created_at FROM web_vital_events ORDER BY id DESC LIMIT 1").first();
  assert.match(row.created_at, /^\d{4}-\d{2}-\d{2}T\d{2}:00:00\.000Z$/);
});

test("the tables can also be created on first use", async () => {
  await data.ensureWebMonitoring(bootstrap);
  await data.ensureWebMonitoring(bootstrap);
  await data.recordWebMonitoring(bootstrap, [vital(), failure()]);
  assert.equal((await bootstrap.prepare("SELECT COUNT(*) AS n FROM web_vital_events").first()).n, 1);
  assert.equal((await bootstrap.prepare("SELECT COUNT(*) AS n FROM web_error_events").first()).n, 1);
});

test("the report gives the 75th percentile and groups errors", async () => {
  const at = new Date("2020-02-01T05:30:00.000Z");
  await data.recordWebMonitoring(db, [100, 200, 300, 400, 500].map(value => vital({ route: "/help", value })), at);
  await data.recordWebMonitoring(db, [failure({ route: "/help" }), failure({ route: "/help" }), failure({ route: "/help", errorType: "RangeError", file: null, line: null, column: null })], at);
  const result = await (await report()).json();
  assert.equal(result.enabled, true);
  assert.deepEqual(result.vitals.find(row => row.route === "/help"), { route: "/help", name: "LCP", device: "mobile", samples: 5, p75: 400 });
  assert.equal(result.errors[0].count, 2);
  assert.equal(result.errors[0].errorType, "TypeError");
  assert.equal(result.errors[0].column, 20);
  assert.equal(result.errors[0].lastSeen, "2020-02-01T05:00:00.000Z");
  assert.equal(result.errors[1].file, null);
});

test("only owner and finance staff can read the report", async () => {
  globalThis.__monitoringAdmin = null;
  assert.equal((await report()).status, 401);
  globalThis.__monitoringAdmin = { role: "driver" };
  assert.equal((await report()).status, 403);
  globalThis.__monitoringAdmin = { role: "finance" };
  assert.equal((await report()).status, 200);
  globalThis.__monitoringAdmin = { role: "owner" };
  assert.equal((await reportRoute.GET(new Request("https://example.invalid/api/admin/reports/web-monitoring?from=bad&to=bad"))).status, 400);
});

test("rows older than 30 days are deleted and newer ones stay", async () => {
  const now = new Date("2024-06-30T00:00:00.000Z");
  await data.recordWebMonitoring(db, [vital({ route: "/flights" }), failure({ route: "/flights" })], new Date("2024-05-30T00:00:00.000Z"));
  await data.recordWebMonitoring(db, [vital({ route: "/tours" }), failure({ route: "/tours" })], new Date("2024-06-29T00:00:00.000Z"));
  await data.purgeWebMonitoring(db, now);
  for (const table of ["web_vital_events", "web_error_events"]) {
    assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE route='/flights'`).first()).n, 0);
    assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE route='/tours'`).first()).n, 1);
  }
});
