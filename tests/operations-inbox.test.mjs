import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { createServer } from "vite";
import { migrationStatements } from "./helpers/migrations.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: "2026-05-22", d1Databases: ["DB"] });
const db = await mf.getD1Database("DB");
for (const name of (await readdir(root + "/drizzle")).filter(name => name.endsWith(".sql")).sort()) {
  const statements = migrationStatements(await readFile(root + "/drizzle/" + name, "utf8")).map(sql => sql.trim()).filter(Boolean);
  if (statements.length) await db.batch(statements.map(sql => db.prepare(sql)));
}
globalThis.__inboxTestAdmin = null;
globalThis.__inboxTestEnv = { DB: db };
const vite = await createServer({
  root, configFile: false, appType: "custom", resolve: { alias: { "@": root } },
  plugins: [{
    name: "inbox-test-boundaries", enforce: "pre",
    resolveId(id) {
      if (id === "cloudflare:workers") return "\0inbox-env";
      if (id === "@/lib/admin" || id.endsWith("/lib/admin") || id.endsWith("/lib/admin.ts")) return "\0inbox-admin";
    },
    load(id) {
      if (id === "\0inbox-env") return "export const env=globalThis.__inboxTestEnv";
      if (id === "\0inbox-admin") return "export async function getWaydidiAdmin(){return globalThis.__inboxTestAdmin}";
    },
  }],
  server: { middlewareMode: true },
});
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__inboxTestAdmin; delete globalThis.__inboxTestEnv; });
const inbox = await vite.ssrLoadModule("/lib/operations-inbox.ts");
const route = await vite.ssrLoadModule("/app/api/admin/operations/inbox/route.ts");
const now = new Date().toISOString();

test("inbox rejects guests and every non-operations role at the route boundary", async () => {
  for (const [role, status] of [[null, 401], ["support", 403], ["finance", 403], ["editor", 403]]) {
    globalThis.__inboxTestAdmin = role ? { role } : null;
    const response = await route.GET(new Request("https://example.invalid/api/admin/operations/inbox"));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
  for (const role of ["owner", "operations"]) {
    globalThis.__inboxTestAdmin = { role };
    const response = await route.GET(new Request("https://example.invalid/api/admin/operations/inbox"));
    assert.equal(response.status, 200);
  }
});

test("inbox sorts critical alerts first, excludes resolved alerts and returns no recipient data", async () => {
  for (const [id, severity, status] of [["warning", "warning", "open"], ["critical", "critical", "acknowledged"], ["resolved", "critical", "resolved"]]) {
    await db.prepare("INSERT INTO operations_alerts(id,booking_reference,alert_type,severity,title,dedupe_key,status,detected_at,created_at,updated_at) VALUES(?,?,'test',?,?,?, ?,?,?,?)")
      .bind(id, "ABCD23", severity, "Review journey", id, status, now, now, now).run();
  }
  await db.prepare("INSERT INTO booking_notifications(id,booking_reference,notification_type,recipient,dedupe_key,scheduled_for,status,created_at,updated_at) VALUES('failed','ABCD23','test','private@example.invalid','failed',?,'failed',?,?)").bind(now, now, now).run();
  const result = await inbox.operationsInbox(db);
  assert.equal(result.items[0].id, "alert:critical");
  assert.equal(result.items.length, 3);
  assert.ok(result.items.some(item => item.kind === "delivery"));
  assert.ok(!JSON.stringify(result).includes("private@example.invalid"));
  assert.ok(!result.items.some(item => item.id === "alert:resolved"));
  for (const item of result.items) assert.deepEqual(Object.keys(item).sort(), ["id", "kind", "reference", "severity", "title", "occurredAt"].sort());
});

test("inbox caps results and reports overflow", async () => {
  await db.batch(Array.from({ length: 101 }, (_, index) => db.prepare("INSERT INTO operations_alerts(id,booking_reference,alert_type,title,dedupe_key,status,detected_at,created_at,updated_at) VALUES(?,?,'test','Review',?,'open',?,?,?)").bind("extra-" + index, "ABCD23", "extra-" + index, now, now, now)));
  const result = await inbox.operationsInbox(db);
  assert.equal(result.items.length, 100);
  assert.equal(result.hasMore, true);
});

test("operational errors never copy arbitrary exception messages into error codes", async () => {
  const { safeErrorCode } = await vite.ssrLoadModule("/lib/observability.ts");
  assert.equal(safeErrorCode(new Error("private@example.invalid token=secret")), "UNKNOWN_ERROR");
  assert.equal(safeErrorCode(new TypeError("private@example.invalid")), "TYPE_ERROR");
  assert.equal(safeErrorCode("secret"), "UNKNOWN_ERROR");
});
