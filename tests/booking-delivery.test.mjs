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
globalThis.__deliveryEnv = { DB: db };
const vite = await createServer({ root, configFile: false, appType: "custom", resolve: { alias: { "@": root } }, server: { middlewareMode: true }, plugins: [{
  name: "delivery-env", enforce: "pre",
  resolveId(id) { if (id === "cloudflare:workers") return "\0delivery-env"; },
  load(id) { if (id === "\0delivery-env") return "export const env=globalThis.__deliveryEnv"; },
}] });
after(async () => { await vite.close(); await mf.dispose(); delete globalThis.__deliveryEnv; });
const delivery = await vite.ssrLoadModule("/lib/booking-delivery-db.ts");
const inbox = await vite.ssrLoadModule("/lib/operations-inbox.ts");
const prepared = (text = "Private confirmation") => ({ payload: { from: "Bookings <from@example.invalid>", to: ["private@example.invalid"], text }, idempotencyKey: "old-key" });
async function claim(id, age = 0) {
  const at = new Date().toISOString(), created = new Date(Date.now() - age).toISOString();
  await db.prepare("INSERT OR IGNORE INTO bookings(reference,customer_name,customer_email,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,total,status,payment_status,access_token_hash,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind("MAIL23", "Test Traveller", "private@example.invalid", "Bangkok", "Pattaya", "2027-01-01", "09:00", 1, 0, "economy_sedan", "cash", 1000, "confirmed", "cash_due", "test", at, at).run();
  await db.prepare("INSERT INTO booking_deliveries(id,booking_reference,channel,recipient,status,attempts,attempted_at,created_at,updated_at) VALUES(?,'MAIL23','customer_email','private@example.invalid','processing',1,?,?,?)").bind(id, at, created, at).run();
  return { id, attempted_at: at, created_at: created, attempts: 1, last_error: null };
}
const row = id => db.prepare("SELECT * FROM booking_deliveries WHERE id=?").bind(id).first();
async function reclaim(job) {
  const at = new Date(Date.parse(job.attempted_at) + 1).toISOString();
  await db.prepare("UPDATE booking_deliveries SET status='processing',attempted_at=?,attempts=attempts+1 WHERE id=?").bind(at, job.id).run();
  return { ...job, attempted_at: at, attempts: job.attempts + 1 };
}

test("runtime bootstrap is repeatable and preserves existing delivery records", async () => {
  const job = await claim("bootstrap");
  await Promise.all([delivery.ensureDeliveryPayloads(db), delivery.ensureDeliveryPayloads(db)]);
  assert.equal((await row(job.id)).status, "processing");
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM booking_delivery_payloads").first()).n, 0);
});

test("competing renderers freeze one complete message across multiple D1 blobs", async () => {
  const job = await claim("frozen"), first = prepared("A".repeat(2100000)), second = prepared("B".repeat(2100000));
  await Promise.all([delivery.freezeDeliveryEmail(db, job, first), delivery.freezeDeliveryEmail(db, job, second)]);
  const frozen = await delivery.readDeliveryEmail(db, job.id);
  assert.ok([first.payload.text, second.payload.text].includes(frozen.prepared.payload.text));
  assert.equal(frozen.state.parts, 3);
  assert.match(frozen.prepared.idempotencyKey, /^booking-delivery:[a-f0-9]{64}$/);
  const before = JSON.stringify(frozen);
  await delivery.freezeDeliveryEmail(db, job, prepared("changed"));
  assert.equal(JSON.stringify(await delivery.readDeliveryEmail(db, job.id)), before);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM booking_delivery_payload_parts").first()).n, 3);
});

test("a failed part insert rolls back the entire snapshot", async () => {
  const job = await claim("rollback");
  await db.prepare("CREATE TRIGGER reject_delivery_part BEFORE INSERT ON booking_delivery_payload_parts BEGIN SELECT RAISE(ABORT,'test write failure'); END").run();
  try { await assert.rejects(() => delivery.freezeDeliveryEmail(db, job, prepared())); }
  finally { await db.prepare("DROP TRIGGER reject_delivery_part").run(); }
  assert.equal(await delivery.readDeliveryEmail(db, job.id), null);
});

test("a stale renderer cannot freeze or send after another worker owns its lease", async () => {
  const job = await claim("stale"), newer = await reclaim(job);
  await delivery.freezeDeliveryEmail(db, job, prepared());
  assert.equal(await delivery.readDeliveryEmail(db, job.id), null);
  await delivery.freezeDeliveryEmail(db, newer, prepared());
  assert.equal(await delivery.beginDeliverySend(db, job), null);
  await delivery.closeDeliveryClaim(db, job, "dead_letter", "stale");
  assert.equal((await row(job.id)).status, "processing");
});

test("a late provider response cannot replace the new worker's result or receipt", async () => {
  const job = await claim("late-result");
  await delivery.freezeDeliveryEmail(db, job, prepared());
  const oldState = await delivery.beginDeliverySend(db, job), newer = await reclaim(job);
  const state = await delivery.beginDeliverySend(db, newer);
  assert.equal(state.outcome_unknown, 1, "an interrupted provider call remains ambiguous");
  await delivery.finishDeliverySend(db, newer, { status: "sent", providerMessageId: "new-id" }, state);
  await delivery.finishDeliverySend(db, job, { status: "failed", retryable: true, outcomeUnknown: true, failureCode: "network_unknown" }, oldState);
  assert.equal((await row(job.id)).status, "sent");
  assert.equal((await db.prepare("SELECT provider_message_id FROM booking_delivery_payloads WHERE delivery_id=?").bind(job.id).first()).provider_message_id, "new-id");
});

test("rate-limit backoff is persisted and explicit permanent rejection stops", async () => {
  let job = await claim("rate");
  await delivery.freezeDeliveryEmail(db, job, prepared());
  let state = await delivery.beginDeliverySend(db, job), before = Date.now();
  await delivery.finishDeliverySend(db, job, { status: "failed", retryable: true, outcomeUnknown: false, failureCode: "rate_limited", retryAfterMs: 3600000 }, state);
  assert.equal((await row(job.id)).status, "failed");
  assert.ok(Date.parse((await row(job.id)).next_attempt_at) >= before + 3600000);
  job = await reclaim(job); state = await delivery.beginDeliverySend(db, job);
  assert.equal(state.outcome_unknown, 0);
  await delivery.finishDeliverySend(db, job, { status: "failed", retryable: false, outcomeUnknown: false, failureCode: "request_rejected" }, state);
  assert.equal((await row(job.id)).status, "dead_letter");
  assert.equal((await row(job.id)).next_attempt_at, null);
});

test("an ambiguous earlier attempt remains uncertain after a later permanent rejection", async () => {
  let job = await claim("unknown");
  await delivery.freezeDeliveryEmail(db, job, prepared());
  let state = await delivery.beginDeliverySend(db, job);
  await delivery.finishDeliverySend(db, job, { status: "failed", retryable: true, outcomeUnknown: true, failureCode: "network_unknown" }, state);
  job = await reclaim(job); state = await delivery.beginDeliverySend(db, job);
  await delivery.finishDeliverySend(db, job, { status: "failed", retryable: false, outcomeUnknown: false, failureCode: "request_rejected" }, state);
  assert.equal((await row(job.id)).status, "uncertain");
});

test("provider attempts stop at the time window, attempt limit and queue age", async () => {
  for (const [id, updates, age] of [
    ["window", "first_attempt_at='2000-01-01T00:00:00.000Z'", 0],
    ["budget", "send_attempts=12", 0],
    ["age", "send_attempts=0", 8 * 86400000],
  ]) {
    const job = await claim(id, age);
    await delivery.freezeDeliveryEmail(db, job, prepared());
    await db.prepare(`UPDATE booking_delivery_payloads SET ${updates} WHERE delivery_id=?`).bind(job.id).run();
    assert.equal(await delivery.beginDeliverySend(db, job), null);
  }
  const job = await claim("long-hold");
  await delivery.freezeDeliveryEmail(db, job, prepared());
  const state = await delivery.beginDeliverySend(db, job);
  await delivery.finishDeliverySend(db, job, { status: "failed", retryable: true, outcomeUnknown: false, failureCode: "rate_limited", retryAfterMs: 24 * 3600000 }, state);
  assert.equal((await row(job.id)).status, "dead_letter");
});

test("snapshot corruption is detected before a provider attempt", async () => {
  const job = await claim("corrupt");
  await delivery.freezeDeliveryEmail(db, job, prepared());
  await db.prepare("UPDATE booking_delivery_payload_parts SET data=? WHERE snapshot_id=(SELECT snapshot_id FROM booking_delivery_payloads WHERE delivery_id=?)").bind(new Uint8Array([1, 2, 3]), job.id).run();
  await assert.rejects(() => delivery.readDeliveryEmail(db, job.id), /delivery_snapshot_invalid/);
  assert.equal((await db.prepare("SELECT send_attempts FROM booking_delivery_payloads WHERE delivery_id=?").bind(job.id).first()).send_attempts, 0);
});

test("retention removes private bodies while retaining receipts and live retries", async () => {
  for (const [id, status, days] of [["purge-sent", "sent", 8], ["purge-review", "uncertain", 31], ["keep-review", "uncertain", 29], ["keep-retry", "failed", 31]]) {
    const job = await claim(id);
    await delivery.freezeDeliveryEmail(db, job, prepared());
    const at = new Date(Date.now() - days * 86400000).toISOString();
    await db.prepare("UPDATE booking_deliveries SET status=?,sent_at=?,updated_at=? WHERE id=?").bind(status, at, at, id).run();
  }
  await delivery.purgeDeliveryPayloads(db);
  for (const id of ["purge-sent", "purge-review"]) {
    assert.ok(await row(id));
    assert.ok(await db.prepare("SELECT content_hash FROM booking_delivery_payloads WHERE delivery_id=?").bind(id).first());
    await assert.rejects(() => delivery.readDeliveryEmail(db, id), /delivery_snapshot_invalid/);
  }
  for (const id of ["keep-review", "keep-retry"]) assert.ok(await delivery.readDeliveryEmail(db, id));
});

test("staff inbox surfaces review and stopped delivery jobs without private payloads", async () => {
  const result = await inbox.operationsInbox(db, { kind: "delivery", offset: 0 });
  assert.ok(result.items.some(item => item.id === "delivery_job:unknown" && item.status === "uncertain"));
  assert.ok(result.items.some(item => item.id === "delivery_job:rate" && item.status === "dead_letter"));
  assert.ok(!JSON.stringify(result).includes("private@example.invalid"));
  assert.ok(!JSON.stringify(result).includes("Private confirmation"));
});

test("an outbox insert failure rolls back confirmation before any external request", async () => {
  const { getDb } = await vite.ssrLoadModule("/db/index.ts"), { bookings } = await vite.ssrLoadModule("/db/schema.ts");
  const flow = await vite.ssrLoadModule("/lib/booking-fulfillment.ts"), now = new Date().toISOString();
  const [booking] = await getDb().insert(bookings).values({ reference: "MAIL24", customerName: "Test Traveller", customerEmail: "private@example.invalid", pickup: "Bangkok", dropoff: "Pattaya", pickupDate: "2027-01-01", pickupTime: "09:00", passengers: 1, luggage: 0, vehicle: "economy_sedan", paymentMethod: "cash", total: 1000, status: "pending_payment", paymentStatus: "cash_due", accessTokenHash: "test", createdAt: now, updatedAt: now }).returning();
  await db.prepare("CREATE TRIGGER fail_confirmation_intent BEFORE INSERT ON booking_deliveries WHEN NEW.booking_reference='MAIL24' AND NEW.channel='customer_email' BEGIN SELECT RAISE(ABORT,'test crash'); END").run();
  const originalFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("unexpected request"); };
  try { await assert.rejects(() => flow.fulfillBooking(booking)); }
  finally { globalThis.fetch = originalFetch; await db.prepare("DROP TRIGGER fail_confirmation_intent").run(); }
  assert.equal((await db.prepare("SELECT status FROM bookings WHERE reference='MAIL24'").first()).status, "pending_payment");
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM booking_deliveries WHERE booking_reference='MAIL24'").first()).n, 0);
  assert.equal(requests, 0);
});

test("concurrent confirmations persist one job per channel and hold legacy ambiguity even without credentials", async () => {
  const flow = await vite.ssrLoadModule("/lib/booking-fulfillment.ts"), { sha256 } = await vite.ssrLoadModule("/lib/security.ts");
  const { getDb } = await vite.ssrLoadModule("/db/index.ts"), { bookings } = await vite.ssrLoadModule("/db/schema.ts"), { eq } = await import("drizzle-orm");
  const id = `MAIL24:customer_email:${(await sha256("private@example.invalid")).slice(0, 16)}`, at = new Date().toISOString();
  await db.prepare("UPDATE bookings SET payment_intent_id='pi_keep' WHERE reference='MAIL24'").run();
  await db.prepare("INSERT INTO booking_deliveries(id,booking_reference,channel,recipient,status,attempts,last_error,created_at,updated_at) VALUES(?,'MAIL24','customer_email','private@example.invalid','failed',1,'Email delivery has not been confirmed.',?,?)").bind(id, at, at).run();
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, "MAIL24"));
  const originalFetch = globalThis.fetch; let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("unexpected request"); };
  try { await Promise.all([flow.fulfillBooking(booking), flow.fulfillBooking(booking)]); }
  finally { globalThis.fetch = originalFetch; }
  const saved = await db.prepare("SELECT status,payment_intent_id FROM bookings WHERE reference='MAIL24'").first();
  assert.equal(saved.status, "confirmed"); assert.equal(saved.payment_intent_id, "pi_keep");
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM booking_deliveries WHERE booking_reference='MAIL24'").first()).n, 4);
  assert.equal((await row(id)).status, "uncertain"); assert.equal((await row(id)).last_error, "legacy_payload_missing");
  assert.equal(requests, 0);
});

test("background delivery is opt-in and the existing recovery consumer processes deferred jobs", async () => {
  const { getDb } = await vite.ssrLoadModule("/db/index.ts"), { bookings } = await vite.ssrLoadModule("/db/schema.ts");
  const flow = await vite.ssrLoadModule("/lib/booking-fulfillment.ts"), now = new Date().toISOString();
  const [booking] = await getDb().insert(bookings).values({ reference: "MAIL25", customerName: "Test Traveller", customerEmail: "private@example.invalid", pickup: "Bangkok", dropoff: "Pattaya", pickupDate: "2027-01-01", pickupTime: "09:00", passengers: 1, luggage: 0, vehicle: "economy_sedan", paymentMethod: "cash", total: 1000, status: "pending_payment", paymentStatus: "cash_due", accessTokenHash: "test", createdAt: now, updatedAt: now }).returning();
  globalThis.__deliveryEnv.BOOKING_BACKGROUND_DELIVERY = "1";
  try {
    await flow.fulfillBooking(booking);
    let jobs = (await db.prepare("SELECT * FROM booking_deliveries WHERE booking_reference='MAIL25' AND channel<>'confirmation'").all()).results;
    assert.equal(jobs.length, 3); assert.ok(jobs.every(job => job.status === "pending" && job.attempts === 0));
    await flow.runDeliveryRecovery();
    jobs = (await db.prepare("SELECT * FROM booking_deliveries WHERE booking_reference='MAIL25' AND channel<>'confirmation'").all()).results;
    assert.ok(jobs.every(job => job.status === "pending_configuration" && job.attempts === 1));
  } finally { delete globalThis.__deliveryEnv.BOOKING_BACKGROUND_DELIVERY; }
});
