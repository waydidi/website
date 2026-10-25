import { expect, test, type Page } from "@playwright/test";

const assignmentId = "sync-assignment";
const trip = (currentStatus: string) => ({
  evidencePolicy: { pickup_required: 0, dropoff_required: 0, gps_required: 0, gps_timeout_ms: 5000, max_accuracy_m: 2000, retention_days: 30 },
  evidenceOverrides: { pickup: false, dropoff: false },
  assignment: { id: assignmentId, currentStatus, tokenExpiresAt: "2099-01-01", passengerVerifiedAt: null, passengerVerificationMethod: null, passengerVerificationAttemptsRemaining: 5 },
  driver: { fullName: "Test Driver", phone: "000" },
  booking: { leg: "outbound", reference: "TEST01", customerName: "Test booking", customerPhone: "000", pickup: "Bangkok", dropoff: "Pattaya", pickupDate: "2026-11-01", pickupTime: "09:00", passengers: 2, luggage: 1, vehicle: "economy_sedan", flightNumber: null, pickupLatitude: null, pickupLongitude: null, status: "confirmed" },
  events: [], activeStop: null, payoutDetails: null,
  noShow: { eligibleAt: null, airport: false, freeWaitMinutes: 30, maxDistanceMetres: 2000 },
});
type Step = { id: string; status: string; sync?: { blocked: boolean; attempts: number; error: string | null } };
async function storedStep(page: Page): Promise<Step | null> {
  return page.evaluate(id => new Promise((resolve, reject) => {
    const opened = indexedDB.open("waydidi-driver", 2);
    opened.onerror = () => reject(opened.error);
    opened.onsuccess = () => {
      const db = opened.result, tx = db.transaction("pending-steps", "readonly"), request = tx.objectStore("pending-steps").get(id);
      tx.oncomplete = () => { db.close(); const value = request.result; resolve(value ? { id: value.id, status: value.status, sync: value.sync } : null); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }), assignmentId);
}
async function driver(page: Page, handle: (event: { id: string; status: string }, respond: (value: object, status?: number, headers?: Record<string, string>) => Promise<void>, fail: () => Promise<void>) => Promise<void>) {
  let currentStatus = "assigned";
  await page.addInitScript(id => localStorage.setItem(`waydidi-driver-welcome:${id}`, "1"), assignmentId);
  await page.route("**/api/driver/trips/session", async route => {
    if (route.request().method() === "GET") { await route.fulfill({ json: trip(currentStatus) }); return; }
    const body = route.request().postData() ?? "";
    const event = { id: body.match(/name="clientEventId"\r\n\r\n([^\r]+)/)?.[1] ?? "", status: body.match(/name="status"\r\n\r\n([^\r]+)/)?.[1] ?? "" };
    await handle(event, async (value, status = 200, headers = {}) => {
      if (status === 200 && "eventId" in value && value.eventId === event.id) currentStatus = event.status;
      await route.fulfill({ status, json: value, headers });
    }, () => route.abort("failed"));
  });
  await page.route("**/api/driver/trips/session/plan", route => route.fulfill({ json: { days: [] } }));
  await page.route("**/api/driver/location", route => route.fulfill({ json: { ok: true } }));
  page.on("dialog", dialog => dialog.accept());
  await page.goto("/driver/trip/session");
  await expect(page.getByRole("button", { name: "เริ่มเดินทางไปจุดรับ", exact: true })).toBeVisible();
}

test("IndexedDB v1 upgrades without losing a queued photo, and unrelated acknowledgments cannot clear it", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const original = { id: "legacy-event", assignmentId: "legacy-assignment", status: "no_show", note: "Original note", occurredAt: "2026-10-25T01:00:00Z", latitude: 13.75, longitude: 100.5, accuracy: 10, photo: new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/jpeg" }), photoName: "proof.jpg" };
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open("waydidi-driver", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("pending-steps", { keyPath: "assignmentId" });
      open.onerror = () => reject(open.error);
      open.onsuccess = () => { const db = open.result, tx = db.transaction("pending-steps", "readwrite"); tx.objectStore("pending-steps").put(original); tx.oncomplete = () => { db.close(); resolve(); }; };
    });
    const path = "/lib/driver-step-queue.ts", queue = await import(path);
    const before = await queue.readQueuedStep(original.assignmentId);
    const unrelated = await queue.acknowledgeQueuedStep(original.assignmentId, "different-event");
    let conflict = false;
    try { await queue.saveQueuedStep({ ...original, id: "replacement-event" }); } catch { conflict = true; }
    const after = await queue.readQueuedStep(original.assignmentId);
    await queue.acknowledgeQueuedStep(original.assignmentId, original.id);
    return { beforeId: before.id, unrelatedId: unrelated.id, conflict, note: after.note, bytes: [...new Uint8Array(await after.photo.arrayBuffer())], empty: await queue.readQueuedStep(original.assignmentId), sync: await queue.readDriverSync(original.assignmentId) };
  });
  expect(result.beforeId).toBe("legacy-event"); expect(result.unrelatedId).toBe("legacy-event"); expect(result.conflict).toBe(true);
  expect(result.note).toBe("Original note"); expect(result.bytes).toEqual([1, 2, 3, 4]); expect(result.empty).toBeNull(); expect(result.sync.lastSuccessAt).toBeTruthy();
});

test("two tabs cannot overwrite a pending step, steal its live lease or apply a stale rejection", async ({ page, context }) => {
  const other = await context.newPage();
  await Promise.all([page.goto("/"), other.goto("/")]);
  const save = (target: Page, id: string) => target.evaluate(async eventId => {
    const path = "/lib/driver-step-queue.ts", queue = await import(path);
    try { await queue.saveQueuedStep({ id: eventId, assignmentId: "shared", status: "going_to_standby", note: eventId, occurredAt: "2026-10-25T01:00:00Z", latitude: null, longitude: null, accuracy: null, photo: null, photoName: null }); return "saved"; }
    catch { return "conflict"; }
  }, id);
  const results = await Promise.all([save(page, "one"), save(other, "two")]);
  expect(results.sort()).toEqual(["conflict", "saved"]);
  const eventId = await page.evaluate(async () => { const path = "/lib/driver-step-queue.ts"; return (await (await import(path)).readQueuedStep("shared")).id as string; });
  const claim = (target: Page) => target.evaluate(async id => { const path = "/lib/driver-step-queue.ts"; return (await import(path)).claimQueuedStepAttempt("shared", id); }, eventId);
  const claims = await Promise.all([claim(page), claim(other)]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const lease = claims.find(Boolean).sync.leaseId as string;
  const guarded = await page.evaluate(async ({ id, oldLease }) => {
    const path = "/lib/driver-step-queue.ts", queue = await import(path);
    const clearedWhileSending = await queue.clearQueuedStep("shared", id);
    const next = await queue.claimQueuedStepAttempt("shared", id, false, Date.now() + 76000);
    const stale = await queue.updateQueuedStepSync("shared", id, (sync: object) => ({ ...sync, blocked: true }), oldLease);
    const current = await queue.readQueuedStep("shared");
    let payloadConflict = false;
    try { await queue.saveQueuedStep({ ...current, note: "Changed after queueing" }); } catch { payloadConflict = true; }
    return { clearedWhileSending, nextLease: next.sync.leaseId, stale, currentLease: current.sync.leaseId, attempts: current.sync.attempts, blocked: current.sync.blocked, note: current.note, payloadConflict };
  }, { id: eventId, oldLease: lease });
  expect(guarded.clearedWhileSending).toBe(false); expect(guarded.stale).toBeNull(); expect(guarded.nextLease).not.toBe(lease);
  expect(guarded.currentLease).toBe(guarded.nextLease); expect(guarded.attempts).toBe(2); expect(guarded.blocked).toBe(false);
  expect(guarded.note).toBe(eventId); expect(guarded.payloadConflict).toBe(true);
});

test("storage read failure is not reported as an empty queue", async ({ page }) => {
  await page.goto("/");
  const failed = await page.evaluate(async () => {
    const path = "/lib/driver-step-queue.ts", queue = await import(path);
    const descriptor = Object.getOwnPropertyDescriptor(window, "indexedDB");
    Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    try { await queue.readQueuedStep("assignment"); return false; }
    catch { return true; }
    finally { if (descriptor) Object.defineProperty(window, "indexedDB", descriptor); else Reflect.deleteProperty(window, "indexedDB"); }
  });
  expect(failed).toBe(true);
});

test("lost responses and mismatched acknowledgments retain one original event until a matching retry", async ({ page }) => {
  const ids: string[] = [], effects = new Set<string>();
  await driver(page, async (event, respond, fail) => {
    ids.push(event.id); effects.add(event.id);
    if (ids.length === 1) { await fail(); return; }
    if (ids.length === 2) { await respond({ ok: true, eventId: "wrong-event", status: event.status }); return; }
    await respond({ ok: true, eventId: event.id, status: event.status, duplicate: true });
  });
  await page.getByRole("button", { name: "เริ่มเดินทางไปจุดรับ", exact: true }).click();
  await expect(page.getByRole("button", { name: "ส่งตอนนี้", exact: true })).toBeVisible();
  await expect.poll(() => storedStep(page)).not.toBeNull();
  await page.getByRole("button", { name: "ส่งตอนนี้", exact: true }).click();
  await expect(page.getByText("ยังไม่ได้รับการยืนยันที่ตรงกับข้อมูลนี้ ระบบจะตรวจสอบคำขอเดิมอีกครั้ง", { exact: true })).toBeVisible();
  expect((await storedStep(page))?.id).toBe(ids[0]);
  await page.getByRole("button", { name: "ส่งตอนนี้", exact: true }).click();
  await expect.poll(() => storedStep(page)).toBeNull();
  await expect(page.getByTestId("driver-last-sync")).toBeVisible();
  expect(ids).toHaveLength(3); expect(new Set(ids).size).toBe(1); expect(effects.size).toBe(1);
});

test("rejected steps survive reload and are retried only after an explicit driver action", async ({ page }) => {
  const ids: string[] = [];
  let allowed = false;
  await driver(page, async (event, respond) => {
    ids.push(event.id);
    if (!allowed) { await respond({ error: "ฝ่ายปฏิบัติการต้องตรวจสอบข้อมูลนี้" }, 409); return; }
    await respond({ ok: true, eventId: event.id, status: event.status });
  });
  await page.getByRole("button", { name: "เริ่มเดินทางไปจุดรับ", exact: true }).click();
  await expect(page.getByText("ฝ่ายปฏิบัติการต้องตรวจสอบข้อมูลนี้", { exact: true })).toBeVisible();
  const original = await storedStep(page); expect(original?.sync?.blocked).toBe(true);
  await page.reload();
  await expect(page.getByText("ฝ่ายปฏิบัติการต้องตรวจสอบข้อมูลนี้", { exact: true })).toBeVisible();
  expect(ids).toHaveLength(1); expect((await storedStep(page))?.id).toBe(original?.id);
  allowed = true;
  await page.getByRole("button", { name: "ส่งตอนนี้", exact: true }).click();
  await expect.poll(() => storedStep(page)).toBeNull();
  expect(ids).toEqual([original?.id, original?.id]);
});

test("offline steps are durable and reconnect with the same event ID", async ({ page, context }) => {
  const ids: string[] = [];
  await driver(page, async (event, respond) => { ids.push(event.id); await respond({ ok: true, eventId: event.id, status: event.status }); });
  await context.setOffline(true);
  await page.getByRole("button", { name: "เริ่มเดินทางไปจุดรับ", exact: true }).click();
  await expect(page.getByText(/บันทึกไว้ในโทรศัพท์แล้ว เวลา/)).toBeVisible();
  const original = await storedStep(page); expect(original?.id).toBeTruthy(); expect(ids).toHaveLength(0);
  await context.setOffline(false);
  await expect.poll(() => storedStep(page)).toBeNull();
  expect(ids).toEqual([original?.id]);
});

test("an unpersisted online attempt stays visible and becomes durable when storage recovers", async ({ page }) => {
  await page.addInitScript(() => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "indexedDB");
    Object.defineProperty(window, "indexedDB", { configurable: true, value: undefined });
    Object.defineProperty(window, "__restoreQueueStorage", { value: () => {
      if (descriptor) Object.defineProperty(window, "indexedDB", descriptor); else Reflect.deleteProperty(window, "indexedDB");
    } });
  });
  const ids: string[] = [];
  await driver(page, async (event, respond, fail) => {
    ids.push(event.id);
    if (ids.length === 1) { await fail(); return; }
    await respond({ ok: true, eventId: event.id, status: event.status });
  });
  await page.getByRole("button", { name: "เริ่มเดินทางไปจุดรับ", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ข้อมูลนี้ยังไม่ได้บันทึกในโทรศัพท์" })).toBeVisible();
  await page.evaluate(() => { Reflect.get(window, "__restoreQueueStorage")(); window.dispatchEvent(new Event("focus")); });
  await expect(page.getByText(/บันทึกไว้ในโทรศัพท์แล้ว เวลา/)).toBeVisible();
  expect((await storedStep(page))?.id).toBe(ids[0]);
  await page.getByRole("button", { name: "ส่งตอนนี้", exact: true }).click();
  await expect.poll(() => storedStep(page)).toBeNull();
  expect(ids).toHaveLength(2); expect(ids[0]).toBe(ids[1]);
});

test("a rejected step is removed only after the driver confirms, without changing server status", async ({ page }) => {
  const ids: string[] = [];
  await driver(page, async (event, respond) => { ids.push(event.id); await respond({ error: "ตรวจสอบกับฝ่ายปฏิบัติการ" }, 409); });
  await page.getByRole("button", { name: "เริ่มเดินทางไปจุดรับ", exact: true }).click();
  const discard = page.getByRole("button", { name: "ตรวจสอบแล้ว ลบข้อมูลรอส่ง", exact: true });
  await expect(discard).toBeVisible();
  page.removeAllListeners("dialog");
  page.once("dialog", dialog => dialog.dismiss());
  await discard.click();
  expect((await storedStep(page))?.id).toBe(ids[0]);
  page.once("dialog", dialog => dialog.accept());
  await discard.click();
  await expect.poll(() => storedStep(page)).toBeNull();
  await expect(page.getByRole("button", { name: "เริ่มเดินทางไปจุดรับ", exact: true })).toBeVisible();
  expect(ids).toHaveLength(1);
});

test("rate-limit holds persist across reload and disable premature manual retry", async ({ page }) => {
  let attempts = 0;
  await driver(page, async (_event, respond) => { attempts++; await respond({ error: "รอก่อนส่งอีกครั้ง" }, 429, { "Retry-After": "180" }); });
  await page.getByRole("button", { name: "เริ่มเดินทางไปจุดรับ", exact: true }).click();
  await expect(page.getByRole("button", { name: "ส่งตอนนี้", exact: true })).toBeDisabled();
  expect((await storedStep(page))?.sync?.error).toBe("rate_limited");
  await page.reload();
  await expect(page.getByRole("button", { name: "ส่งตอนนี้", exact: true })).toBeDisabled();
  expect(attempts).toBe(1);
});

test("an invalid success page cannot masquerade as a successful trip sync", async ({ page }) => {
  await driver(page, async (event, respond) => { await respond({ ok: true, eventId: event.id, status: event.status }); });
  await page.route("**/api/driver/trips/session", route => route.fulfill({ status: 200, contentType: "text/html", body: "<html>Temporary gateway page</html>" }));
  await page.reload();
  await expect(page.getByText("ยังไม่ได้รับข้อมูลงานที่ถูกต้อง กรุณาลองอีกครั้ง", { exact: true })).toBeVisible();
  await expect(page.getByTestId("driver-last-sync")).toHaveCount(0);
});
