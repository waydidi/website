import { expect, test, type Page } from "@playwright/test";
// Driver trip page: the stop-reason popup opens when the car has been still for a long time.
const base = {
  evidencePolicy: { pickup_required: 0, dropoff_required: 0, gps_required: 0, gps_timeout_ms: 5000, max_accuracy_m: 2000, retention_days: 30 },
  evidenceOverrides: { pickup: false, dropoff: false },
  assignment: { id: "a1", currentStatus: "trip_started", tokenExpiresAt: "2099-01-01", passengerVerifiedAt: null, passengerVerificationMethod: null, passengerVerificationAttemptsRemaining: 5 },
  driver: { fullName: "Thanakorn Boonmee", phone: "000" },
  booking: { leg: "outbound", reference: "52LLDS", customerName: "Non Naowarat", customerPhone: "000", pickup: "BKK", dropoff: "Pattaya", pickupDate: "2026-10-11", pickupTime: "09:00", passengers: 2, luggage: 2, vehicle: "Economy sedan", flightNumber: null, pickupLatitude: null, pickupLongitude: null, status: "confirmed" },
  events: [], activeStop: null, payoutDetails: null,
  noShow: { eligibleAt: null, airport: false, freeWaitMinutes: 30, maxDistanceMetres: 2000 },
};
async function open(page: Page, stopAlert: boolean, ping: string) {
  await page.addInitScript(() => { Object.defineProperty(navigator.geolocation, "getCurrentPosition", { value: (ok: PositionCallback) => setTimeout(() => ok({ coords: { latitude: 13.7, longitude: 100.5, accuracy: 10 }, timestamp: Date.now() } as GeolocationPosition), 10) }); });
  await page.route("**/api/driver/trips/session", (r) => r.fulfill({ json: { ...base, stopAlert } }));
  await page.route("**/api/driver/trips/session/plan", (r) => r.fulfill({ json: { days: [] } }));
  await page.route("**/api/driver/location", (r) => r.fulfill({ json: { ok: true, abnormalStop: { status: ping, durationSeconds: 700 } } }));
  await page.goto("/driver/trip/session");
}
test("popup when the page reports a stop alert", async ({ page }) => {
  await open(page, true, "normal");
  const dlg = page.getByRole("dialog", { name: "หยุดรถนานกว่าปกติ?" });
  await expect(dlg).toBeVisible({ timeout: 30000 });
  await dlg.getByRole("button", { name: "ยังไม่ใช่ตอนนี้" }).click();
  await expect(dlg).toBeHidden();
});
test("popup when location says the car has been still", async ({ page }) => {
  await open(page, false, "potential");
  await expect(page.getByRole("dialog", { name: "หยุดรถนานกว่าปกติ?" })).toBeVisible({ timeout: 30000 });
});
test("no popup while moving; manual link opens it", async ({ page }) => {
  await open(page, false, "normal");
  await expect(page.getByText("กำลังแชร์ตำแหน่งสดระหว่างเดินทาง")).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /แจ้งหยุดรถ/ }).click();
  await expect(page.getByRole("dialog", { name: "หยุดรถนานกว่าปกติ?" })).toBeVisible();
});
