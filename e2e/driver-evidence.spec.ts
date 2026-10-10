import { test, expect, type Page } from "@playwright/test";
import jpeg from "jpeg-js";

// Driver trip page: Stand by, Pick up and Drop are confirmed with a photo from the step camera
// (opened by the bottom button), which is uploaded and then sent with the step.
const fixture = (currentStatus: string) => ({
  evidencePolicy: { pickup_required: 0, dropoff_required: 0, gps_required: 0, gps_timeout_ms: 5000, max_accuracy_m: 2000, retention_days: 30 },
  evidenceOverrides: { pickup: false, dropoff: false },
  assignment: { id: `evidence-${currentStatus}`, currentStatus, tokenExpiresAt: "2099-01-01", passengerVerifiedAt: null, passengerVerificationMethod: null, passengerVerificationAttemptsRemaining: 5 },
  driver: { fullName: "Test Driver", phone: "000" },
  booking: { leg: "outbound", reference: "TEST01", customerName: "Test booking", customerPhone: "000", pickup: "Bangkok", dropoff: "Pattaya", pickupDate: "2026-11-01", pickupTime: "09:00", passengers: 2, luggage: 1, vehicle: "economy_sedan", flightNumber: null, pickupLatitude: null, pickupLongitude: null, status: "confirmed" },
  events: [], activeStop: null, payoutDetails: null,
  noShow: { eligibleAt: null, airport: false, freeWaitMinutes: 30, maxDistanceMetres: 2000 },
});

async function setup(page: Page, currentStatus: string, { camera = true, location = true, granted = true } = {}) {
  const sent: { status: string; evidenceId: string | null }[] = [];
  const uploads: string[] = [];
  const uploadGps: (string | null)[] = [];
  const pings: string[] = [];
  await page.addInitScript(({ camera, location, granted }) => {
    // Whether location and camera were allowed before ("prompt" shows the permission cards).
    Object.defineProperty(navigator.permissions, "query", { value: async () => ({ state: granted ? "granted" : "prompt" }) });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      if (!camera) throw new Error("NotAllowedError");
      const canvas = document.createElement("canvas"); canvas.width = 480; canvas.height = 640;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#64748b"; ctx.fillRect(0, 0, 480, 640);
      ctx.fillStyle = "#FE8B05"; ctx.fillRect(50, 150, 380, 180);
      return canvas.captureStream(10);
    } });
    const fix = { coords: { latitude: 13.75, longitude: 100.5, accuracy: 12 }, timestamp: Date.now() } as GeolocationPosition;
    const denied = { code: 1, PERMISSION_DENIED: 1, message: "denied" } as GeolocationPositionError;
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { value: (ok: PositionCallback, fail: PositionErrorCallback) => setTimeout(() => location ? ok(fix) : fail(denied), 10) });
    Object.defineProperty(navigator.geolocation, "watchPosition", { value: (ok: PositionCallback, fail: PositionErrorCallback) => { setTimeout(() => location ? ok(fix) : fail(denied), 10); return 1; } });
    Object.defineProperty(navigator.geolocation, "clearWatch", { value: () => undefined });
  }, { camera, location, granted });
  await page.route("**/api/driver/trips/session", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: fixture(currentStatus) });
    const body = route.request().postData() ?? "";
    sent.push({ status: body.match(/name="status"\r\n\r\n([^\r]+)/)?.[1] ?? "", evidenceId: body.match(/name="evidenceId"\r\n\r\n([^\r]+)/)?.[1] ?? null });
    return route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/driver/trips/session/plan", (route) => route.fulfill({ json: { days: [] } }));
  await page.route("**/api/driver/trips/session/evidence", (route) => {
    const id = route.request().postData()?.match(/name="id"\r\n\r\n([^\r]+)/)?.[1] ?? "";
    uploads.push(id);
    uploadGps.push(route.request().postData()?.match(/name="latitude"\r\n\r\n([^\r]+)/)?.[1] ?? null);
    return route.fulfill({ json: { evidence: { id, event_type: "pickup", received_at: new Date().toISOString(), device_captured_at: new Date().toISOString(), confirmed_at: null, status_event_id: null } } });
  });
  await page.route("**/api/driver/location", (route) => { pings.push(route.request().url()); return route.fulfill({ json: { ok: true } }); });
  await page.goto("/driver/trip/session");
  return { sent, uploads, uploadGps, pings };
}

test("Stand by: the button opens the camera; the photo is uploaded and sent with the step", async ({ page }) => {
  const { sent, uploads, uploadGps, pings } = await setup(page, "going_to_standby");
  const button = page.getByRole("button", { name: "ยืนยันว่าถึงจุดรับแล้ว" });
  await expect(button).toBeVisible({ timeout: 30000 });
  await expect(page.locator("video")).toHaveCount(0); // no camera until the button is tapped
  page.on("dialog", () => { throw new Error("Photo steps don't ask for a separate confirmation"); });
  await button.click();
  const camera = page.getByRole("dialog", { name: "รอที่จุดรับ" });
  await expect(camera.locator("video")).toBeVisible();
  await expect.poll(() => camera.locator("video").evaluate((v) => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  await camera.getByRole("button", { name: "ถ่ายรูป" }).click();
  await expect(camera.getByRole("img", { name: "รูปที่ถ่าย" })).toBeVisible();
  await camera.getByRole("button", { name: "ถ่ายใหม่" }).click(); // retake goes back to the live camera
  await expect(camera.locator("video")).toBeVisible();
  await expect.poll(() => camera.locator("video").evaluate((v) => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  await camera.getByRole("button", { name: "ถ่ายรูป" }).click();
  await camera.getByRole("button", { name: "ใช้รูปนี้" }).click();
  await expect(camera).toBeHidden();
  await expect.poll(() => sent.length).toBe(1);
  expect(uploads).toHaveLength(1);
  expect(sent[0]).toEqual({ status: "standby", evidenceId: uploads[0] });
  expect(uploadGps[0]).toBe("13.75"); // the photo carries where it was taken
  expect(pings).toHaveLength(0); // no live location sharing
});

test("before the camera: step 1 asks for location, step 2 for the camera, then the camera opens", async ({ page }) => {
  await setup(page, "going_to_standby", { granted: false });
  await page.getByRole("button", { name: "ยืนยันว่าถึงจุดรับแล้ว" }).click({ timeout: 30000 });
  const sheet = page.getByRole("dialog", { name: "รอที่จุดรับ" });
  await expect(sheet.getByText("ขั้นตอน 1 จาก 2")).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "อนุญาตให้ Waydidi ใช้ตำแหน่งของคุณ" })).toBeVisible();
  await expect(sheet.locator("video")).toHaveCount(0);
  await sheet.getByRole("button", { name: "อนุญาตตำแหน่ง" }).click();
  await expect(sheet.getByText("ขั้นตอน 2 จาก 2")).toBeVisible();
  await expect(sheet.getByRole("heading", { name: "อนุญาตให้ Waydidi ใช้กล้อง" })).toBeVisible();
  await sheet.getByRole("button", { name: "อนุญาตกล้อง" }).click();
  await expect(sheet.locator("video")).toBeVisible();
  await expect(sheet.getByText(/Waydidi GPS · 13\.75000, 100\.50000/)).toBeVisible();
});

test("location refused: the card explains how to turn it on and the camera stays closed", async ({ page }) => {
  await setup(page, "going_to_standby", { granted: false, location: false });
  await page.getByRole("button", { name: "ยืนยันว่าถึงจุดรับแล้ว" }).click({ timeout: 30000 });
  const sheet = page.getByRole("dialog", { name: "รอที่จุดรับ" });
  await sheet.getByRole("button", { name: "อนุญาตตำแหน่ง" }).click();
  await expect(sheet.getByRole("alert")).toContainText("เปิดสิทธิ์ตำแหน่งให้ waydidi.com");
  await expect(sheet.getByRole("button", { name: "ลองอีกครั้ง" })).toBeVisible();
  await expect(sheet.getByText("ขั้นตอน 2 จาก 2")).toHaveCount(0);
  await expect(sheet.locator("video")).toHaveCount(0);
});

test("Pick up and Drop also use the camera; without a live camera the phone's camera app is used", async ({ page }) => {
  const { sent, uploads } = await setup(page, "standby", { camera: false });
  await page.getByRole("button", { name: "เริ่มการเดินทาง" }).click({ timeout: 30000 });
  const camera = page.getByRole("dialog", { name: "เริ่มการเดินทาง" });
  await expect(camera.getByText("เปิดกล้องในหน้านี้ไม่ได้", { exact: false })).toBeVisible();
  // The fallback is the camera app (capture), never the photo library.
  await expect(camera.locator('input[type="file"]')).toHaveAttribute("capture", "environment");
  const jpegBytes = jpeg.encode({ width: 20, height: 40, data: new Uint8Array(20 * 40 * 4).fill(200) }, 80).data;
  await camera.locator('input[type="file"]').setInputFiles({ name: "camera.jpg", mimeType: "image/jpeg", buffer: jpegBytes });
  await camera.getByRole("button", { name: "ใช้รูปนี้" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({ status: "trip_started", evidenceId: uploads[0] });
});

test("closing the camera sends nothing", async ({ page }) => {
  const { sent } = await setup(page, "trip_started");
  await page.getByRole("button", { name: "ยืนยันว่าส่งลูกค้าแล้ว" }).click({ timeout: 30000 });
  const camera = page.getByRole("dialog", { name: "ส่งลูกค้าเรียบร้อย" });
  await expect(camera).toBeVisible();
  await camera.getByRole("button", { name: "ปิดกล้อง" }).click();
  await expect(camera).toBeHidden();
  expect(sent).toHaveLength(0);
});

test("going to pickup has no photo: it asks to confirm and sends without a camera", async ({ page }) => {
  const { sent, uploads } = await setup(page, "assigned");
  const welcome = page.getByRole("dialog", { name: "Welcome, driver" });
  await welcome.getByRole("button", { name: "เริ่มงาน" }).click({ timeout: 30000 });
  page.on("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "เริ่มเดินทางไปจุดรับ" }).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toEqual({ status: "going_to_standby", evidenceId: null });
  expect(uploads).toHaveLength(0);
  await expect(page.locator("video")).toHaveCount(0);
});
