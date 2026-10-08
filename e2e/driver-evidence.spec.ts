import { test, expect } from "@playwright/test";
import jpeg from "jpeg-js";

const fixture = {
  evidencePolicy: { pickup_required: 0, dropoff_required: 0, gps_required: 0, gps_timeout_ms: 5000, max_accuracy_m: 2000, retention_days: 30 },
  evidenceOverrides: { pickup: false, dropoff: false },
  assignment: { id: "test-outbound-assignment", currentStatus: "going_to_standby", tokenExpiresAt: "2099-01-01", passengerVerifiedAt: null, passengerVerificationMethod: null, passengerVerificationAttemptsRemaining: 5 },
  driver: { fullName: "Test Driver", phone: "000" },
  booking: { leg: "outbound", reference: "TEST01", customerName: "Test booking", customerPhone: "000", pickup: "Bangkok", dropoff: "Pattaya", pickupDate: "2026-11-01", pickupTime: "09:00", passengers: 2, luggage: 1, vehicle: "economy_sedan", flightNumber: null, pickupLatitude: null, pickupLongitude: null, status: "confirmed" },
  events: [], activeStop: null, payoutDetails: null,
  noShow: { eligibleAt: null, airport: false, freeWaitMinutes: 30, maxDistanceMetres: 2000 },
};
async function setup(page: import("@playwright/test").Page, denied = false) {
  await page.addInitScript(({ denied }) => {
    const stats = { camera: 0, location: 0, options: [] as PositionOptions[] };
    Object.assign(window, { evidenceTestStats: stats });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      stats.camera++;
      const canvas = document.createElement("canvas"); canvas.width = 480; canvas.height = 640;
      const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#64748b"; ctx.fillRect(0, 0, 480, 640);
      ctx.fillStyle = "#FE8B05"; ctx.fillRect(50, 150, 380, 180); ctx.fillStyle = "#14202e"; ctx.font = "bold 32px Arial"; ctx.fillText("WAYDIDI PICKUP", 70, 230);
      return canvas.captureStream(10);
    } });
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { value: (success: PositionCallback, failure: PositionErrorCallback, options: PositionOptions) => {
      stats.location++; stats.options.push(options);
      setTimeout(() => denied ? failure({ code: 1, message: "Denied" } as GeolocationPositionError) : success({ coords: { latitude: 13.75, longitude: 100.5, accuracy: 12 }, timestamp: Date.now() } as GeolocationPosition), 20);
    } });
  }, { denied });
  await page.route("**/api/driver/trips/session", route => route.fulfill({ json: fixture }));
  await page.route("**/api/driver/trips/session/plan", route => route.fulfill({ json: { days: [] } }));
  await page.route("**/api/driver/trips/session/evidence", route => route.request().method() === "GET" ? route.fulfill({ json: { evidence: [], policy: fixture.evidencePolicy } }) : route.fulfill({ status: 503, json: { error: "Simulated slow connection. Retry this photo." } }));
  await page.goto("/driver/trip/session");
  await expect(page.getByRole("heading", { name: "Pickup GPS Camera" })).toBeVisible();
}
test("camera starts on demand, capture has fresh GPS, retake and upload retry preserve event id", async ({ page }) => {
  await setup(page);
  expect(await page.evaluate(() => (window as unknown as {evidenceTestStats:{camera:number;location:number}}).evidenceTestStats)).toMatchObject({ camera: 0, location: 0 });
  await page.getByRole("button", { name: "Take Photo", exact: true }).click();
  await expect(page.locator("video")).toBeVisible();
  await expect.poll(() => page.locator("video").evaluate(v => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Capture photo", exact: true }).click();
  await expect(page.getByText("Fresh device-reported GPS", { exact: true })).toBeVisible();
  await expect(page.getByText("PICKUP PHOTO · TEST01 / outbound")).toBeVisible();
  await expect(page.getByText("13.75000, 100.50000 · ±12 m")).toBeVisible();
  await expect(page.getByText("Address unavailable", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await expect.poll(() => page.locator("video").evaluate(v => (v as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Capture photo", exact: true }).click();
  await expect(page.getByText("Fresh device-reported GPS", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Simulated slow connection" })).toBeVisible();
  let firstId = "", secondId = "";
  await page.route("**/api/driver/trips/session/evidence", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { evidence: [] } });
    const id = route.request().postData()?.match(/name="id"\r\n\r\n([^\r]+)/)?.[1] ?? "";
    if (!firstId) { firstId = id; return route.fulfill({ status: 503, json: { error: "Retry once more" } }); }
    secondId = id;
    return route.fulfill({ json: { evidence: { id, event_type: "pickup", received_at: new Date().toISOString(), device_captured_at: new Date().toISOString(), confirmed_at: null, status_event_id: null } } });
  });
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Retry once more" })).toBeVisible();
  await page.getByRole("button", { name: "Save photo", exact: true }).click();
  await expect(page.getByText("Photo saved privately.", { exact: false })).toBeVisible();
  expect(firstId).toBeTruthy(); expect(secondId).toBe(firstId);
  const stats = await page.evaluate(() => (window as unknown as {evidenceTestStats:{options:PositionOptions[]}}).evidenceTestStats);
  expect(stats.options[0]).toMatchObject({ maximumAge: 0, enableHighAccuracy: true });
});
test("mobile fallback respects aspect ratio, denied GPS is truthful, refresh recovers draft", async ({ page }) => {
  await setup(page, true);
  const jpegBytes = jpeg.encode({ width: 20, height: 40, data: new Uint8Array(20 * 40 * 4).fill(200) }, 80).data;
  await page.locator('input[capture="environment"]').first().setInputFiles({ name: "camera.jpg", mimeType: "image/jpeg", buffer: jpegBytes });
  await expect(page.getByText("Location unavailable", { exact: true })).toBeVisible();
  const dimensions = await page.getByRole("img", { name: "pickup evidence preview" }).evaluate(img => ({ w: (img as HTMLImageElement).naturalWidth, h: (img as HTMLImageElement).naturalHeight }));
  expect(dimensions.h / dimensions.w).toBe(2);
  await expect(page.getByText(/Device capture \(unverified\)/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("img", { name: "pickup evidence preview" })).toBeVisible();
  await expect(page.getByText("Location unavailable", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Retry Location", exact: true }).click();
  await expect(page.getByText(/Location unavailable\. Retry/)).toBeVisible();
  await page.getByRole("button", { name: "Discard photo", exact: true }).click();
  await expect(page.getByRole("img", { name: "pickup evidence preview" })).toHaveCount(0);
});
