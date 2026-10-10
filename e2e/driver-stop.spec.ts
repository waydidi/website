import { expect, test, type Page } from "@playwright/test";
// Driver trip page: no live location sharing and no automatic stop popup; the driver can still
// report a stop from the small link.
const base = {
  evidencePolicy: { pickup_required: 0, dropoff_required: 0, gps_required: 0, gps_timeout_ms: 5000, max_accuracy_m: 2000, retention_days: 30 },
  evidenceOverrides: { pickup: false, dropoff: false },
  assignment: { id: "a1", currentStatus: "trip_started", tokenExpiresAt: "2099-01-01", passengerVerifiedAt: null, passengerVerificationMethod: null, passengerVerificationAttemptsRemaining: 5 },
  driver: { fullName: "Thanakorn Boonmee", phone: "000" },
  booking: { leg: "outbound", reference: "52LLDS", customerName: "Non Naowarat", customerPhone: "000", pickup: "BKK", dropoff: "Pattaya", pickupDate: "2026-10-11", pickupTime: "09:00", passengers: 2, luggage: 2, vehicle: "Economy sedan", flightNumber: null, pickupLatitude: null, pickupLongitude: null, status: "confirmed" },
  events: [], activeStop: null, payoutDetails: null,
  noShow: { eligibleAt: null, airport: false, freeWaitMinutes: 30, maxDistanceMetres: 2000 },
};
async function open(page: Page) {
  const pings: string[] = [];
  await page.route("**/api/driver/trips/session", (r) => r.fulfill({ json: { ...base, stopAlert: true } }));
  await page.route("**/api/driver/trips/session/plan", (r) => r.fulfill({ json: { days: [] } }));
  await page.route("**/api/driver/location", (r) => { pings.push(r.request().url()); return r.fulfill({ json: { ok: true, abnormalStop: { status: "open", durationSeconds: 1500 } } }); });
  await page.goto("/driver/trip/session");
  return pings;
}
test("no automatic stop popup and no live location sharing", async ({ page }) => {
  const pings = await open(page);
  await expect(page.getByRole("button", { name: /แจ้งหยุดรถ/ })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(2000);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("กำลังแชร์ตำแหน่งสดระหว่างเดินทาง")).toHaveCount(0);
  expect(pings).toHaveLength(0);
});
test("the driver can still report a stop from the link", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: /แจ้งหยุดรถ/ }).click({ timeout: 30000 });
  const dlg = page.getByRole("dialog", { name: "หยุดรถนานกว่าปกติ?" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "ยังไม่ใช่ตอนนี้" }).click();
  await expect(dlg).toBeHidden();
});
