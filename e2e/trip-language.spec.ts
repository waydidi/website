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

test("with a driver assigned: the headline says the driver is ready and progress has four steps", async ({ page }) => {
  const assigned = { ...trip, stage: "assigned", legs: [{ ...trip.legs[0], status: "assigned" }] };
  await page.route("**/api/trip/LANG01**", (route) => route.fulfill({ json: assigned }));
  await page.route("**/api/maps/config", (route) => route.fulfill({ json: {} }));
  await page.goto("/trip/LANG01?lang=en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your driver is ready for your trip");
  const steps = page.locator("section[aria-labelledby='trip-timeline'] ol > li");
  await expect(steps).toHaveCount(4);
  expect(await steps.locator("p.font-black").allTextContents()).toEqual(["Booking confirmed", "Driver is on stand by", "On the way", "Arrived"]);
  await expect(steps.first()).toHaveAttribute("aria-current", "step");
});

test("the address keeps the link's code, so it opens in another browser (Telegram → Open in Safari)", async ({ page, browser }) => {
  const mock = async (p: Page) => {
    await mockTrip(p);
    await p.route("**/api/trip/access", (route) => route.fulfill({ json: { ok: true } }));
  };
  await mock(page);
  await page.goto("/trip/LANG01?ride=" + "a1".repeat(16) + "&lang=en");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("ride")).toBe("a1".repeat(16));
  const other = await browser.newContext();
  const fresh = await other.newPage();
  await mock(fresh);
  let query = "";
  await fresh.route("**/api/trip/access", (route) => { query = JSON.parse(route.request().postData() ?? "{}").query; return route.fulfill({ json: { ok: true } }); });
  // Safari from Telegram may not send the session cookie back: the trip request itself carries the code.
  await fresh.route("**/api/trip/LANG01**", (route) => new URL(route.request().url()).searchParams.get("ride") === "a1".repeat(16) ? route.fulfill({ json: trip }) : route.fulfill({ status: 404, json: { error: "not found" } }));
  await fresh.goto(page.url());
  await expect(fresh.getByRole("heading", { level: 1 })).toHaveText("Your driver is on the way");
  expect(new URLSearchParams(query).get("ride")).toBe("a1".repeat(16));
  await other.close();
});
