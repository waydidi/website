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
  await expect(gallery.locator("figcaption")).toHaveCount(0); // no place names over the photos
  const slides = gallery.locator("figure");
  await expect(slides.nth(0)).toHaveAttribute("aria-hidden", "false");
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-top-${info.project.name}.png` });
  // About every 5 seconds the next photo comes; the one leaving keeps zooming while it fades (no jump back).
  await expect(slides.nth(1)).toHaveAttribute("aria-hidden", "false", { timeout: 7_000 });
  expect(await slides.nth(0).locator("img").evaluate((el) => getComputedStyle(el).animationName)).toBe("trip-photo-zoom");
  expect(await slides.nth(1).locator("img").evaluate((el) => getComputedStyle(el).animationName)).toBe("trip-photo-zoom");
  expect(await slides.nth(2).locator("img").evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  // Tapping the right half of the photo shows the next one, the left half the one before.
  const box0 = (await gallery.boundingBox())!;
  const shown = async () => Number(await slides.evaluateAll((els) => els.findIndex((el) => el.getAttribute("aria-hidden") === "false")));
  const before = await shown();
  await page.mouse.click(box0.x + box0.width * 0.85, box0.y + box0.height * 0.4);
  await expect.poll(shown).toBe((before + 1) % 4);
  await page.mouse.click(box0.x + box0.width * 0.15, box0.y + box0.height * 0.4);
  await expect.poll(shown).toBe(before);
  // "Gallery": full screen, the photo that was showing first, swiped sideways, no names.
  await gallery.getByRole("button", { name: "Gallery" }).click();
  const all = page.getByRole("dialog", { name: "Photos of your trip" });
  await expect(all.getByRole("img")).toHaveCount(4);
  const box = await all.boundingBox(), screen = page.viewportSize();
  expect([box?.width, box?.height]).toEqual([screen?.width, screen?.height]);
  const counter = all.getByText(/^\d \/ 4$/);
  const opened = Number((await counter.textContent())!.split(" / ")[0]);
  expect(opened).toBeGreaterThan(1); // it opened on the photo that was showing, not the first one
  await expect(all.locator("figcaption")).toHaveCount(0);
  const strip = all.locator("figure").first().locator("..");
  const next = opened % 4; // the next photo, 0-based (back to the first after the last)
  await strip.evaluate((el, i) => el.scrollTo({ left: el.clientWidth * i, behavior: "instant" }), next);
  await expect(counter).toHaveText(`${next + 1} / 4`);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-gallery-${info.project.name}.png` });
  await all.getByRole("button", { name: "Close" }).click();
  await expect(all).toHaveCount(0);

  // Highlights first: the card shows the first highlight; "See more" opens all of them in a sheet from the bottom.
  const highlights = page.locator("#highlights");
  await expect(highlights.getByRole("heading", { name: "Highlights" })).toBeVisible();
  await expect(highlights.getByText("Feed and bathe rescued elephants")).toBeVisible();
  await highlights.getByRole("button", { name: "See more" }).click();
  const sheet = page.getByRole("dialog", { name: "Highlights" });
  expect(await sheet.getByRole("listitem").allTextContents()).toEqual(["Feed and bathe rescued elephants", "45-metre marble Buddha with views over Chalong Bay"]);
  if (process.env.SHOT_DIR) { await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-highlights-sheet-${info.project.name}.png` }); }
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  // What to expect, like Klook: a line about the day, a bullet per place, the places numbered with their photos, and
  // a box with the meeting point, the hours and the entrance fees. Then the day as a timeline on one grey line.
  const overview = page.locator("#expect");
  await expect(overview.getByRole("heading", { name: "What to expect" })).toBeVisible();
  await expect(overview.getByText("A private day with your own car and driver, picking you up at Kata Beach Resort.")).toBeVisible();
  await expect(overview.getByText("Visit Big Buddha", { exact: true })).toBeVisible();
  const board = overview.getByRole("list").nth(1);
  expect(await board.locator(":scope > li").allTextContents()).toEqual(["1Elephant Jungle Sanctuary", "2Big Buddha"]);
  await expect(board.getByRole("img", { name: "Big Buddha" })).toBeVisible();
  await expect(overview.getByText("Pickup at 08:30 from Kata Beach Resort")).toBeVisible();
  await expect(overview.getByText("08:30 – 17:00 (depending on traffic)")).toBeVisible();
  await expect(overview.getByText("Elephant Jungle Sanctuary: THB 2,000 per adult, THB 1,000 per child (in your price)")).toBeVisible();
  await expect(overview.getByText("Big Buddha: THB 100 per adult (paid on the day)")).toBeVisible();
  if (process.env.SHOT_DIR) { await board.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-expect-${info.project.name}.png` }); }
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
  // Tapping a place's photo opens the full-screen gallery at that place's first photo.
  const viewer = page.getByRole("dialog", { name: "Photos of your trip" });
  await steps.nth(2).getByRole("button", { name: "Big Buddha" }).click();
  await expect(viewer.getByText(/^\d \/ 4$/)).toHaveText("2 / 4");
  await viewer.getByRole("button", { name: "Close" }).click();
  await board.getByRole("button", { name: "Elephant Jungle Sanctuary" }).click();
  await expect(viewer.getByText(/^\d \/ 4$/)).toHaveText("1 / 4");
  await viewer.getByRole("button", { name: "Close" }).click();
  await expect(viewer).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View full itinerary" })).toHaveCount(0);
  if (process.env.SHOT_DIR) { await overview.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-overview-${info.project.name}.png` }); await steps.nth(2).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-timeline-${info.project.name}.png` }); }
  await page.evaluate(() => window.scrollTo(0, 0));

  const tabs = page.getByRole("navigation", { name: "Trip sections" });
  expect(await tabs.getByRole("link").allTextContents()).toEqual(["Highlights", "Includes/Excludes", "What to expect", "Booking"]);

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
  for (const id of ["highlights", "expect", "includes", "booking"]) expect(await page.locator(`#${id}`).evaluate((el) => getComputedStyle(el).borderTopLeftRadius), id).toBe("0px");
  if (process.env.SHOT_DIR) { await page.waitForTimeout(1000); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-end-${info.project.name}.png` }); }
});
