import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";

// The customer's own smart-trip link (/itinerary/<token>): breadcrumbs, a photo strip made from the trip's attractions,
// and a tab bar under it that jumps to each part of the page. The trip is written into the LOCAL dev database only.
const D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const localDatabases = () => readdirSync(D1_DIR).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite").map((f) => `${D1_DIR}/${f}`)
  .filter((path) => { const db = new DatabaseSync(path, { readOnly: true }); try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='smart_trips'").get(); } finally { db.close(); } });
const TOKEN = "ITINPAGETESTTOKEN234";
const stop = (id: string, name: string, start: number, extra: Record<string, unknown>) => ({ id, kind: "attraction", name, arrival: start, start, end: start + 120, travelMin: 30, program: null, sessionTime: null, checkIn: null,
  lat: null, lng: null, note: null, description: null, highlights: [], cover: null, gallery: [], dressCode: null, openHours: null, fee: null, ...extra });
const snapshot = {
  version: 1, createdAt: "2026-10-01T00:00:00Z", ref: "TP-E2E1", title: "Phuket elephants and Big Buddha", tripDate: "2099-03-14", startTime: "08:30",
  pickupText: "Kata Beach Resort", pickup: null, endText: "Kata Beach Resort", end: null, durationHours: 8, adults: 2, children: 1, vehicle: "comfort_suv", vehicleName: "Comfort SUV",
  customerName: "Test Customer", language: "en", notes: "Bring swimwear for the elephant bath.", returnAt: 17 * 60, returnTravel: 30, totalDrive: 120,
  transportPrice: 3200, feesIncluded: 4000, feesOnSite: 0, discount: 0, total: 7200, packing: ["Swimwear", "Sun cream"],
  stops: [
    stop("s1", "Elephant Jungle Sanctuary", 9 * 60 + 30, { cover: "/destinations/phuket.webp", gallery: ["/destinations/krabi.webp"], highlights: ["Feed and bathe rescued elephants"], fee: { adult: 2000, child: 1000, included: true } }),
    stop("s2", "Big Buddha", 13 * 60, { cover: "/destinations/bangkok.webp", gallery: ["/destinations/ayutthaya.webp"], highlights: ["45-metre marble Buddha with views over Chalong Bay"], fee: { adult: 100, child: 0, included: false } }),
  ],
};

test.beforeAll(() => {
  const at = new Date().toISOString();
  for (const path of localDatabases()) {
    const db = new DatabaseSync(path);
    try {
      db.prepare(`INSERT OR REPLACE INTO smart_trips(id,ref,status,title,token,snapshot_json,version,sent_at,hold_days,language,created_at,updated_at)
        VALUES('e2e-itinerary-page','TP-E2E1','sent',?,?,?,1,?,3650,'en',?,?)`).run(snapshot.title, TOKEN, JSON.stringify(snapshot), at, at, at);
    } finally { db.close(); }
  }
});
test.afterAll(() => { for (const path of localDatabases()) { const db = new DatabaseSync(path); try { db.prepare("DELETE FROM smart_trips WHERE id='e2e-itinerary-page'").run(); } finally { db.close(); } } });

test("breadcrumbs, the trip's photos and section tabs that jump to each part", async ({ page }, info) => {
  await page.goto(`/itinerary/${TOKEN}`);
  await page.waitForLoadState("networkidle"); // the tabs mark the section once the page is interactive
  expect(await page.evaluate(() => window.scrollY), "the page opens at the top").toBe(0);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0); // no breadcrumb: the photos come first
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(snapshot.title);
  await expect(page.getByText("Departing from Kata Beach Resort")).toBeVisible();
  for (const chip of ["Private car", "Hotel pickup", "3 travellers", "8hr duration", "2 stops"]) await expect(page.getByRole("listitem").filter({ hasText: new RegExp(`^${chip}$`) })).toBeVisible();

  // Photos at the top: covers first in visiting order, then gallery photos, each labelled with its stop; one
  // loading bar per photo, and the next photo comes by itself.
  const gallery = page.getByRole("region", { name: "Photos of your trip" });
  const photos = gallery.locator("figure img");
  await expect(photos).toHaveCount(4);
  expect(await photos.evaluateAll((els) => els.map((e) => e.getAttribute("alt")))).toEqual(["Elephant Jungle Sanctuary", "Big Buddha", "Elephant Jungle Sanctuary", "Big Buddha"]);
  await expect(gallery.locator("div[aria-hidden] > span")).toHaveCount(4);
  const slides = gallery.locator("figure");
  await expect(slides.nth(0)).toHaveAttribute("aria-hidden", "false");
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-top-${info.project.name}.png` });
  await expect(slides.nth(1)).toHaveAttribute("aria-hidden", "false", { timeout: 8_000 });
  await gallery.getByRole("button", { name: "Gallery" }).click();
  const all = page.getByRole("dialog", { name: "Photos of your trip" });
  await expect(all.getByRole("img")).toHaveCount(4);
  await all.getByRole("button", { name: "Close" }).click();
  await expect(all).toHaveCount(0);

  // The Overview card: the whole day as a timeline on one grey line (departure, each place with its photo, return).
  const overview = page.locator("#overview");
  // The highlights card shows the first highlight; "See more" opens all of them in a sheet from the bottom.
  await expect(overview.getByText("Feed and bathe rescued elephants")).toBeVisible();
  await overview.getByRole("button", { name: "See more" }).click();
  const sheet = page.getByRole("dialog", { name: "Highlights" });
  expect(await sheet.getByRole("listitem").allTextContents()).toEqual(["Feed and bathe rescued elephants", "45-metre marble Buddha with views over Chalong Bay"]);
  if (process.env.SHOT_DIR) { await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-highlights-sheet-${info.project.name}.png` }); }
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  const timeline = overview.getByRole("list").last();
  const steps = timeline.locator(":scope > li");
  await expect(steps).toHaveCount(4);
  await expect(steps.first()).toContainText("08:30 · Departure");
  await expect(steps.nth(1).getByRole("heading", { name: "Elephant Jungle Sanctuary" })).toBeVisible();
  await expect(steps.nth(1).getByText(/min drive|\d{2}:\d{2}/)).toHaveCount(0); // no times or drive lines on the places
  await expect(steps.nth(1).getByRole("img", { name: "Elephant Jungle Sanctuary" })).toBeVisible();
  await expect(steps.nth(1).getByText("+1", { exact: true })).toBeVisible(); // one more gallery photo
  await expect(steps.nth(2).getByRole("heading", { name: "Big Buddha" })).toBeVisible();
  await expect(steps.last()).toContainText("17:00 · Return");
  await expect(page.getByRole("button", { name: "View full itinerary" })).toHaveCount(0);
  if (process.env.SHOT_DIR) { await overview.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-overview-${info.project.name}.png` }); await steps.nth(2).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-timeline-${info.project.name}.png` }); }
  await page.evaluate(() => window.scrollTo(0, 0));

  const tabs = page.getByRole("navigation", { name: "Trip sections" });
  expect(await tabs.getByRole("link").allTextContents()).toEqual(["Overview", "Includes/Excludes", "Booking"]);

  await tabs.getByRole("link", { name: "Includes/Excludes" }).click();
  const includes = page.locator("#includes");
  await expect(includes).toBeInViewport();
  await expect(tabs).toBeInViewport(); // the tab bar stays at the top while scrolling
  await expect(tabs.getByRole("link", { name: "Includes/Excludes" })).toHaveAttribute("aria-current", "location");
  await expect(includes.getByText("Entrance tickets: Elephant Jungle Sanctuary")).toBeVisible();
  await expect(includes.getByText("Entrance fee at Big Buddha, paid on the day")).toBeVisible();
  // Collapsible rows under What's included, filled from the trip itself.
  for (const name of ["Pick-up & meet-up information", "Before you book", "Terms & Conditions", "How to use"]) await expect(includes.getByText(name, { exact: true })).toBeVisible();
  await includes.getByText("Pick-up & meet-up information", { exact: true }).click();
  await expect(includes.getByText("Pickup at 08:30 from Kata Beach Resort")).toBeVisible();
  await includes.getByText("Before you book", { exact: true }).click();
  await expect(includes.getByText("Swimwear", { exact: true })).toBeVisible();
  await expect(includes.getByText("Bring swimwear for the elephant bath.")).toBeVisible();
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-includes-${info.project.name}.png` });

  await expect(page.getByRole("link", { name: "Book now" })).toHaveCount(0); // no floating bar at the bottom
  await tabs.getByRole("link", { name: "Booking" }).click();
  await expect(page.locator("#booking")).toBeInViewport();
  await expect(page.getByRole("button", { name: /Accept and pay/ })).toBeVisible();
  // Every section runs full width: no rounded cards.
  for (const id of ["overview", "includes", "booking"]) expect(await page.locator(`#${id}`).evaluate((el) => getComputedStyle(el).borderTopLeftRadius), id).toBe("0px");
  if (process.env.SHOT_DIR) { await page.waitForTimeout(1000); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-end-${info.project.name}.png` }); }
});
