import { expect, test, type Page } from "@playwright/test";
// Driver trip page: Pick up / Drop buttons for directions; no live location, stop report or note box.
const base = {
  evidencePolicy: { pickup_required: 0, dropoff_required: 0, gps_required: 0, gps_timeout_ms: 5000, max_accuracy_m: 2000, retention_days: 30 },
  evidenceOverrides: { pickup: false, dropoff: false },
  assignment: { id: "a1", currentStatus: "trip_started", tokenExpiresAt: "2099-01-01", passengerVerifiedAt: null, passengerVerificationMethod: null, passengerVerificationAttemptsRemaining: 5 },
  driver: { fullName: "Thanakorn Boonmee", phone: "000" },
  booking: { leg: "outbound", reference: "52LLDS", customerName: "Non Naowarat", customerPhone: "000", pickup: "Suvarnabhumi Airport (BKK)", dropoff: "Hilton Pattaya", pickupDate: "2026-10-11", pickupTime: "09:00", passengers: 2, luggage: 2, vehicle: "Economy sedan", flightNumber: null, pickupLatitude: null, pickupLongitude: null, status: "confirmed" },
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
test("Pick up and Drop open Google Maps directions to each place", async ({ page }) => {
  await open(page);
  const pickup = page.getByRole("link", { name: /^Pick up:/ });
  await expect(pickup).toBeVisible({ timeout: 30000 });
  await expect(pickup).toHaveAttribute("href", `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("Suvarnabhumi Airport (BKK)")}`);
  await expect(page.getByRole("link", { name: /^Drop:/ })).toHaveAttribute("href", `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("Hilton Pattaya")}`);
});
test("a Google Maps link set in Telegram is used; without one, directions to the address", async ({ page }) => {
  await page.route("**/api/driver/trips/session", (r) => r.fulfill({ json: { ...base, booking: { ...base.booking, pickupMapUrl: "https://maps.app.goo.gl/BKKgate4", dropoffMapUrl: null } } }));
  await page.route("**/api/driver/trips/session/plan", (r) => r.fulfill({ json: { days: [] } }));
  await page.goto("/driver/trip/session");
  await expect(page.getByRole("link", { name: /^Pick up:/ })).toHaveAttribute("href", "https://maps.app.goo.gl/BKKgate4", { timeout: 30000 });
  await expect(page.getByRole("link", { name: /^Drop:/ })).toHaveAttribute("href", `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent("Hilton Pattaya")}`);
  // The buttons sit below the customer card, not inside it.
  await expect(page.locator("section").filter({ hasText: "Customer name" }).getByRole("link", { name: /^Pick up:/ })).toHaveCount(0);
});
test("no live location, stop report, popup or note box", async ({ page }) => {
  const pings = await open(page);
  await expect(page.getByRole("link", { name: /^Drop:/ })).toBeVisible({ timeout: 30000 });
  await page.waitForTimeout(1500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/แจ้งหยุดรถ|กำลังแชร์ตำแหน่งสด|Next step|หมายเหตุ/)).toHaveCount(0);
  expect(pings).toHaveLength(0);
  await expect(page.getByRole("button", { name: "ยืนยันว่าส่งลูกค้าแล้ว" })).toBeVisible(); // the bottom step button stays
});
test("Price (set in Telegram) and Payment sit below To", async ({ page }) => {
  await page.route("**/api/driver/trips/session", (r) => r.fulfill({ json: { ...base, booking: { ...base.booking, price: 1400, paymentStatus: "cash_due" } } }));
  await page.route("**/api/driver/trips/session/plan", (r) => r.fulfill({ json: { days: [] } }));
  await page.goto("/driver/trip/session");
  const labels = page.locator("dl dt");
  await expect(labels.first()).toBeVisible({ timeout: 30000 });
  expect(await labels.allTextContents()).toEqual(["Passengers & luggage", "Vehicle", "Date & time", "From", "To", "Price", "Payment"]);
  await expect(page.locator("dl")).toContainText("THB 1,400");
  await expect(page.locator("dl")).toContainText("Collect cash");
  await page.getByRole("button", { name: "What's included" }).click();
  await expect(page.getByRole("dialog", { name: "What's included" })).toContainText("Private vehicle with driver");
});
test("without a price from Telegram the row reads Not set", async ({ page }) => {
  await page.route("**/api/driver/trips/session", (r) => r.fulfill({ json: { ...base, booking: { ...base.booking, price: null, paymentStatus: "paid" } } }));
  await page.route("**/api/driver/trips/session/plan", (r) => r.fulfill({ json: { days: [] } }));
  await page.goto("/driver/trip/session");
  await expect(page.locator("dl")).toContainText("Not set", { timeout: 30000 });
  await expect(page.locator("dl")).toContainText("Paid");
});
test("the address keeps the real link, so it opens in another browser (Telegram → Open in browser)", async ({ page, browser }) => {
  const link = "/driver/trip/" + "ab12".repeat(12);
  const mock = async (p: Page) => {
    await p.route("**/api/driver/session", (r) => r.fulfill({ json: { ok: true } }));
    await p.route("**/api/driver/trips/session", (r) => r.fulfill({ json: base }));
    await p.route("**/api/driver/trips/*/plan", (r) => r.fulfill({ json: { days: [] } }));
  };
  await mock(page);
  await page.goto(link);
  await expect(page.getByText("Customer name")).toBeVisible({ timeout: 30000 });
  expect(new URL(page.url()).pathname).toBe(link);
  // A different browser: no cookie and no tab storage, only the address.
  const other = await browser.newContext();
  const fresh = await other.newPage();
  await mock(fresh);
  let sent = "";
  await fresh.route("**/api/driver/session", (r) => { sent = JSON.parse(r.request().postData() ?? "{}").token; return r.fulfill({ json: { ok: true } }); });
  await fresh.goto(page.url());
  await expect(fresh.getByText("Customer name")).toBeVisible({ timeout: 30000 });
  expect(sent).toBe("ab12".repeat(12));
  await other.close();
});
test("after an admin confirms the Drop, the page shows the job completed with the customer details", async ({ page }) => {
  const done = { ...base, assignment: { ...base.assignment, currentStatus: "completed" }, events: [{ id: "ev1", status: "completed", createdAt: "2026-10-11T03:00:00Z", verificationStatus: "verified", hasEvidence: true }] };
  await page.route("**/api/driver/trips/session", (r) => r.fulfill({ json: done }));
  await page.route("**/api/driver/trips/session/plan", (r) => r.fulfill({ json: { days: [] } }));
  await page.goto("/driver/trip/session");
  await expect(page.getByRole("heading", { name: "งานนี้เสร็จเรียบร้อย" })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Customer name")).toBeVisible();
  await expect(page.getByText("Non Naowarat")).toBeVisible();
  await expect(page.getByText("รอผู้ดูแลตรวจสอบ")).toHaveCount(0);
});
