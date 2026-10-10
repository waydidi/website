import { expect, test, type Page } from "@playwright/test";
// Driver trip page: the animated welcome screen before a new job, and "เริ่มงาน" to start.
const trip = (currentStatus: string) => ({
  evidencePolicy: { pickup_required: 0, dropoff_required: 0, gps_required: 0, gps_timeout_ms: 5000, max_accuracy_m: 2000, retention_days: 30 },
  evidenceOverrides: { pickup: false, dropoff: false },
  assignment: { id: `welcome-${currentStatus}`, currentStatus, tokenExpiresAt: "2099-01-01", passengerVerifiedAt: null, passengerVerificationMethod: null, passengerVerificationAttemptsRemaining: 5 },
  driver: { fullName: "Test Driver", phone: "000" },
  booking: { leg: "outbound", reference: "TEST01", customerName: "Test booking", customerPhone: "000", pickup: "Bangkok", dropoff: "Pattaya", pickupDate: "2026-11-01", pickupTime: "09:00", passengers: 2, luggage: 1, vehicle: "Economy sedan", flightNumber: null, pickupLatitude: null, pickupLongitude: null, status: "confirmed" },
  events: [], activeStop: null, payoutDetails: null,
  noShow: { eligibleAt: null, airport: false, freeWaitMinutes: 30, maxDistanceMetres: 2000 },
});
async function open(page: Page, status: string) {
  await page.route("**/api/driver/trips/session", (r) => r.fulfill({ json: trip(status) }));
  await page.route("**/api/driver/trips/session/plan", (r) => r.fulfill({ json: { days: [] } }));
  await page.route("**/api/driver/location", (r) => r.fulfill({ json: { ok: true } }));
  await page.goto("/driver/trip/session");
}
test("a new job opens with the welcome screen; เริ่มงาน starts it and it isn't shown again", async ({ page }) => {
  await open(page, "assigned");
  const welcome = page.getByRole("dialog", { name: "Welcome, driver" });
  await expect(welcome).toBeVisible({ timeout: 30000 });
  await welcome.getByRole("button", { name: "เริ่มงาน" }).click();
  await expect(welcome).toBeHidden();
  await expect(page.getByRole("list", { name: "Trip steps" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("list", { name: "Trip steps" })).toBeVisible({ timeout: 30000 });
  await expect(welcome).toHaveCount(0);
});
test("a job already under way goes straight to the steps", async ({ page }) => {
  await open(page, "standby");
  await expect(page.getByRole("list", { name: "Trip steps" })).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("dialog", { name: "Welcome, driver" })).toHaveCount(0);
});
