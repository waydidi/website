import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import { createServer } from "vite";
import { migrationStatements } from "./helpers/migrations.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const mf = new Miniflare({ modules: true, script: 'export default {fetch(){return new Response("test")}}', compatibilityDate: "2026-05-22", d1Databases: ["DB", "BOOTSTRAP"] });
const db = await mf.getD1Database("DB");
for (const name of (await readdir(root + "/drizzle")).filter(name => name.endsWith(".sql")).sort()) {
  const statements = migrationStatements(await readFile(root + "/drizzle/" + name, "utf8")).map(sql => sql.trim()).filter(Boolean);
  if (statements.length) await db.batch(statements.map(sql => db.prepare(sql)));
}
globalThis.__reviewTestEnv = { DB: db };
globalThis.__reviewTestAdmin = null;
const vite = await createServer({ root, configFile: false, appType: "custom", resolve: { alias: { "@": root } }, server: { middlewareMode: true }, plugins: [{
  name: "review-boundaries", enforce: "pre",
  resolveId(id) {
    if (id === "cloudflare:workers") return "\0review-env";
    if (id === "@/lib/admin" || id.endsWith("/lib/admin") || id.endsWith("/lib/admin.ts")) return "\0review-admin";
  },
  load(id) {
    if (id === "\0review-env") return "export const env=globalThis.__reviewTestEnv";
    if (id === "\0review-admin") return "export async function getWaydidiAdmin(){return globalThis.__reviewTestAdmin}";
  },
}] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__reviewTestEnv; delete globalThis.__reviewTestAdmin; });
const reviews = await vite.ssrLoadModule("/lib/payment-review-db.ts");
const rules = await vite.ssrLoadModule("/lib/payment-discrepancies.ts");
const route = await vite.ssrLoadModule("/app/api/admin/payments/reviews/route.ts");
const paymentsRoute = await vite.ssrLoadModule("/app/api/admin/payments/route.ts");
const reconcileRoute = await vite.ssrLoadModule("/app/api/admin/payments/reconcile/route.ts");
const { getDb } = await vite.ssrLoadModule("/db/index.ts");
const schema = await vite.ssrLoadModule("/db/schema.ts");
const now = new Date().toISOString();
for (const reference of ["ABCD23", "EFGH45", "JKLM45", "NPQR67", "STUV89"]) {
  await getDb().insert(schema.bookings).values({ reference, customerName: "Test Traveller", customerEmail: "private@example.invalid", pickup: "Bangkok", dropoff: "Pattaya", pickupDate: "2026-12-01", pickupTime: "09:00", passengers: 1, luggage: 1, vehicle: "economy_sedan", paymentMethod: "stripe", total: 1234.56, amountPaid: 1234.56, status: "confirmed", paymentStatus: "paid", reconciliationStatus: "matched", checkoutSessionId: "cs_test_" + reference, accessTokenHash: "test", createdAt: now, updatedAt: now });
}
const action = (reference, kind = "claim", expectedVersion = 0, note = "") => ({ reference, action: kind, expectedVersion, note, requestId: crypto.randomUUID() });
const request = body => new Request("https://example.invalid/api/admin/payments/reviews", { method: "POST", headers: { origin: "https://example.invalid", "content-type": "application/json" }, body: JSON.stringify(body) });

test("finance routes independently deny guests, operations, support and editors", async () => {
  for (const [role, status] of [[null, 401], ["operations", 403], ["support", 403], ["editor", 403]]) {
    globalThis.__reviewTestAdmin = role ? { id: "staff", role, email: "staff@example.invalid" } : null;
    assert.equal((await route.GET(new Request("https://example.invalid/api/admin/payments/reviews"))).status, status);
    assert.equal((await route.POST(request(action("ABCD23")))).status, status);
    assert.equal((await paymentsRoute.GET()).status, status);
    assert.equal((await paymentsRoute.POST(request({}))).status, status);
    assert.equal((await reconcileRoute.POST(request({}))).status, status);
  }
  for (const role of ["owner", "finance"]) {
    globalThis.__reviewTestAdmin = { id: "alice", role, email: "alice@example.invalid" };
    const response = await route.GET(new Request("https://example.invalid/api/admin/payments/reviews"));
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("review boundary rejects malformed actions, pages, notes and cross-origin writes", async () => {
  globalThis.__reviewTestAdmin = { id: "alice", role: "finance", email: "alice@example.invalid" };
  for (const input of [{}, { ...action("ABCD23"), action: "mark_paid" }, { ...action("ABCD23"), expectedVersion: -1 }, action("ABCD23", "resolve", 0, " "), { ...action("ABCD23"), requestId: "not-an-id" }]) assert.equal((await route.POST(request(input))).status, 400);
  for (const query of ["offset=-1", "offset=1", "status=deleted", "reference=not-a-booking"]) assert.equal((await route.GET(new Request("https://example.invalid/api/admin/payments/reviews?" + query))).status, 400);
  const external = request(action("ABCD23"));
  external.headers.set("origin", "https://other.invalid");
  assert.equal((await route.POST(external)).status, 403);
});

test("specific mismatch reasons never include provider payload text", () => {
  const booking = { reference: "ABCD23", checkoutSessionId: "cs_test", total: 1234.56, paymentIntentId: "pi_one" };
  const session = { provider: "stripe", sessionId: "cs_test", transactionId: "pi_one", bookingReference: "ABCD23", amountMinor: 123456, currency: "thb", status: "paid" };
  assert.deepEqual(rules.paymentDiscrepancies(booking, session), []);
  assert.deepEqual(rules.paymentDiscrepancies(booking, { ...session, sessionId: "wrong", bookingReference: "private@example.invalid", amountMinor: 1, currency: "usd", transactionId: "pi_wrong" }), ["session", "booking", "currency", "amount", "transaction"]);
  assert.deepEqual(rules.paymentDiscrepancies(booking, { ...session, transactionId: undefined }), ["transaction_missing"]);
});

test("concurrent claims and identical retries produce one version and one history event", async () => {
  const input = action("ABCD23");
  const results = await Promise.all([reviews.actOnPaymentReview(db, input, "alice"), reviews.actOnPaymentReview(db, input, "alice")]);
  assert.deepEqual(results.sort(), ["duplicate", "saved"]);
  assert.equal((await reviews.paymentReviewHistory(db, "ABCD23")).length, 1);
  assert.equal(await reviews.actOnPaymentReview(db, { ...input, note: "different payload" }, "alice"), "conflict");
  assert.equal(await reviews.actOnPaymentReview(db, action("ABCD23", "note", 1, "Someone else's case"), "bob"), "conflict");
  const claims = await Promise.all([reviews.actOnPaymentReview(db, action("EFGH45"), "alice"), reviews.actOnPaymentReview(db, action("EFGH45"), "bob")]);
  assert.deepEqual(claims.sort(), ["conflict", "saved"]);
});

test("review resolution requires cleared provider state and preserves money and immutable history", async () => {
  const original = await db.prepare("SELECT total,amount_paid,payment_status FROM bookings WHERE reference='ABCD23'").first();
  assert.equal(await reviews.actOnPaymentReview(db, action("ABCD23", "note", 1, "Compared booking and Stripe"), "alice"), "saved");
  await db.prepare("UPDATE bookings SET reconciliation_status='mismatch' WHERE reference='ABCD23'").run();
  assert.equal(await reviews.actOnPaymentReview(db, action("ABCD23", "resolve", 2, "Investigated"), "alice"), "conflict");
  await db.prepare("UPDATE bookings SET reconciliation_status='matched' WHERE reference='ABCD23'").run();
  assert.equal(await reviews.actOnPaymentReview(db, action("ABCD23", "resolve", 2, "Provider matches the booking"), "alice"), "saved");
  assert.deepEqual(await db.prepare("SELECT total,amount_paid,payment_status FROM bookings WHERE reference='ABCD23'").first(), original);
  assert.deepEqual((await reviews.paymentReviewHistory(db, "ABCD23")).map(e => e.action), ["resolve", "note", "claim"]);
  await assert.rejects(() => db.prepare("UPDATE payment_review_events SET note='rewritten' WHERE booking_reference='ABCD23'").run(), /append-only/);
  await assert.rejects(() => db.prepare("DELETE FROM payment_review_events WHERE booking_reference='ABCD23'").run(), /append-only/);
  assert.ok((await reviews.paymentReviewCases(db, 0, "resolved")).items.some(item => item.reference === "ABCD23"));
  assert.ok(!(await reviews.paymentReviewCases(db, 0)).items.some(item => item.reference === "ABCD23"));
});

test("history insert failure rolls back ownership and a retry succeeds once", async () => {
  const input = action("JKLM45");
  await db.prepare("CREATE TRIGGER fail_review_history BEFORE INSERT ON payment_review_events WHEN NEW.booking_reference='JKLM45' BEGIN SELECT RAISE(ABORT,'simulated history failure'); END").run();
  await assert.rejects(() => reviews.actOnPaymentReview(db, input, "alice"), /simulated history failure/);
  assert.equal(await db.prepare("SELECT * FROM payment_review_state WHERE booking_reference='JKLM45'").first(), null);
  await db.prepare("DROP TRIGGER fail_review_history").run();
  assert.equal(await reviews.actOnPaymentReview(db, input, "alice"), "saved");
  assert.equal(await reviews.actOnPaymentReview(db, input, "alice"), "duplicate");
});

test("latest provider observation gives exact minor units without customer details", async () => {
  await reviews.recordPaymentObservation(db, "NPQR67", ["amount", "currency"], 123456, 100, "usd");
  await db.prepare("UPDATE bookings SET reconciliation_status='mismatch' WHERE reference='NPQR67'").run();
  const result = await reviews.paymentReviewCases(db, 0);
  const row = result.items.find(item => item.reference === "NPQR67");
  assert.equal(row.expectedMinor, 123456); assert.equal(row.providerMinor, 100); assert.equal(row.providerCurrency, "usd");
  assert.deepEqual(JSON.parse(row.reasonsJson), ["amount", "currency"]);
  assert.ok(!JSON.stringify(result).includes("private@example.invalid"));
  await assert.rejects(() => db.prepare("UPDATE payment_review_observations SET provider_amount_minor=0 WHERE booking_reference='NPQR67'").run(), /append-only/);
  await assert.rejects(() => db.prepare("DELETE FROM payment_review_observations WHERE booking_reference='NPQR67'").run(), /append-only/);
});

test("additive runtime bootstrap creates the same tables and history protections", async () => {
  const fresh = await mf.getD1Database("BOOTSTRAP");
  await fresh.prepare("CREATE TABLE bookings(reference TEXT PRIMARY KEY)").run();
  await reviews.ensurePaymentReviews(fresh);
  await reviews.ensurePaymentReviews(fresh);
  for (const table of ["payment_review_state", "payment_review_events", "payment_review_observations"]) assert.ok(await fresh.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(table).first());
  assert.equal((await fresh.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name LIKE 'payment_review_events_no_%'").first()).n, 2);
});

test("review history is paginated without losing older immutable entries", async () => {
  await db.batch(Array.from({ length: 101 }, (_, index) => db.prepare("INSERT INTO payment_review_events(id,booking_reference,actor_id,action,note,version,payload_hash,created_at) VALUES(?,'STUV89','alice','note',?,?,?,?)").bind(crypto.randomUUID(), "Review note " + index, index + 1, "test-only", now)));
  globalThis.__reviewTestAdmin = { id: "alice", role: "finance", email: "alice@example.invalid" };
  const first = await (await route.GET(new Request("https://example.invalid/api/admin/payments/reviews?reference=STUV89"))).json();
  const second = await (await route.GET(new Request("https://example.invalid/api/admin/payments/reviews?reference=STUV89&offset=100"))).json();
  assert.equal(first.events.length, 100); assert.equal(first.hasMore, true);
  assert.equal(second.events.length, 1); assert.equal(second.hasMore, false);
  assert.equal(first.events[0].version, 101); assert.equal(second.events[0].version, 1);
  assert.ok(!first.events.some(event => event.id === second.events[0].id));
});
