import { expect, test, type Page } from "@playwright/test";

// The customer trip status page in the visitor's language. The trip API is mocked; the page's
// wording comes from the server (hand-written for EN/TH/ZH, cached AI translations for the rest).
const trip = {
  reference: "LANG01", access: "owner", stage: "on_the_way", leg: "outbound",
  legs: [{ leg: "outbound", status: "on_the_way", pickupDate: "2026-10-12", pickupTime: "09:30" }],
  serviceType: "transfer", bookedHours: null, pickup: "Suvarnabhumi Airport (BKK)", dropoff: "Hilton Pattaya, Beach Road",
  pickupDate: "2026-10-12", pickupTime: "09:30", flightNumber: null, pickupPoint: null, dropoffPoint: null,
  meetingPoint: null, pickupSign: null, timeline: [{ stage: "confirmed", at: null }], location: null, eta: null,
  standbyPhoto: false, canShare: false, freshness: null, driver: { name: "Somchai Jaidee", phone: "+66812345678" },
  updatedAt: new Date().toISOString(),
};

async function mockTrip(page: Page) {
  await page.route("**/api/trip/LANG01**", (route) => route.fulfill({ json: trip }));
  await page.route("**/api/maps/config", (route) => route.fulfill({ json: {} }));
}

test("follows the browser language and keeps addresses as written", async ({ browser }) => {
  const context = await browser.newContext({ locale: "th-TH", extraHTTPHeaders: { "Accept-Language": "th-TH,th;q=0.9" } });
  const page = await context.newPage();
  await mockTrip(page);
  await page.goto("/trip/LANG01");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("คนขับกำลังไปรับคุณ");
  await expect(page.locator("html")).toHaveAttribute("lang", "th");
  await expect(page.getByText("Hilton Pattaya, Beach Road")).toHaveAttribute("translate", "no");
  await expect(page.getByText("Somchai Jaidee")).toBeVisible();
  await context.close();
});

test("offers every site language and switching keeps the chosen one", async ({ page }) => {
  await mockTrip(page);
  await page.goto("/trip/LANG01?lang=ko");
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await page.getByRole("button", { name: /한국어/ }).click();
  const sheet = page.getByRole("dialog");
  for (const name of ["English", "ภาษาไทย", "简体中文", "Français", "Deutsch", "हिन्दी"]) await expect(sheet.getByRole("button", { name })).toBeVisible();
  await sheet.getByRole("button", { name: "English" }).click();
  await expect(page).toHaveURL(/\?lang=en$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your driver is on the way");
});
