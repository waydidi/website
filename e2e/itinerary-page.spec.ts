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
  pickupText: "Kata Beach Resort", pickup: { lat: 7.8206, lng: 98.2977 }, endText: "Kata Beach Resort", end: null, durationHours: 8, adults: 2, children: 1, vehicle: "comfort_suv", vehicleName: "Comfort SUV",
  customerName: "Test Customer", language: "en", notes: "Bring swimwear for the elephant bath.", returnAt: 17 * 60, returnTravel: 30, totalDrive: 120,
  transportPrice: 3200, feesIncluded: 4000, feesOnSite: 0, discount: 0, total: 7200, packing: ["Swimwear", "Sun cream"],
  stops: [
    stop("s1", "Elephant Jungle Sanctuary", 9 * 60 + 30, { cover: "/destinations/phuket.webp", gallery: ["/destinations/krabi.webp"], highlights: ["Feed and bathe rescued elephants"], lat: 7.86, lng: 98.33, fee: { adult: 2000, child: 1000, included: true } }),
    stop("s2", "Big Buddha", 13 * 60, { cover: "/destinations/bangkok.webp", gallery: ["/destinations/ayutthaya.webp"], highlights: ["45-metre marble Buddha with views over Chalong Bay"], fee: { adult: 100, child: 0, included: false } }),
  ],
};

// Places added from Google Maps have no highlights of their own.
const PLAIN_TOKEN = "ITINPLAINTESTTOKEN23";
const plain = { ...snapshot, ref: "TP-E2E2", title: "Phuket temples", stops: [stop("p1", "Big Buddha", 9 * 60, {}), stop("p2", "Wat Chalong", 11 * 60, {}), stop("p3", "Phuket Old Town", 13 * 60, {}), stop("p4", "Promthep Cape", 16 * 60, {})] };

test.beforeAll(() => {
  const at = new Date().toISOString();
  for (const path of localDatabases()) {
    const db = new DatabaseSync(path);
    try {
      db.prepare(`INSERT OR REPLACE INTO smart_trips(id,ref,status,title,token,snapshot_json,version,sent_at,hold_days,language,created_at,updated_at)
        VALUES('e2e-itinerary-page','TP-E2E1','sent',?,?,?,1,?,3650,'en',?,?)`).run(snapshot.title, TOKEN, JSON.stringify(snapshot), at, at, at);
      db.prepare(`INSERT OR REPLACE INTO smart_trips(id,ref,status,title,token,snapshot_json,version,sent_at,hold_days,language,created_at,updated_at)
        VALUES('e2e-itinerary-plain','TP-E2E2','sent',?,?,?,1,?,3650,'en',?,?)`).run(plain.title, PLAIN_TOKEN, JSON.stringify(plain), at, at, at);
    } finally { db.close(); }
  }
});
test.afterAll(() => { for (const path of localDatabases()) { const db = new DatabaseSync(path); try { db.prepare("DELETE FROM smart_trips WHERE id IN ('e2e-itinerary-page','e2e-itinerary-plain')").run(); } finally { db.close(); } } });

test("breadcrumbs, the trip's photos and section tabs that jump to each part", async ({ page }, info) => {
  await page.goto(`/itinerary/${TOKEN}`);
  await page.waitForLoadState("networkidle"); // the tabs mark the section once the page is interactive
  expect(await page.evaluate(() => window.scrollY), "the page opens at the top").toBe(0);
  await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toHaveCount(0); // no breadcrumb: the photos come first
  // On phones the header has a sign-in (account) icon just left of the menu button.
  if ((page.viewportSize()?.width ?? 0) < 1280) {
    const header = page.locator(".public-path-header header");
    const account = header.locator('a[href^="/account"]').last();
    await expect(account).toBeVisible();
    const [a, m] = [await account.boundingBox(), await header.getByRole("button", { name: /menu/i }).boundingBox()];
    expect(a!.x + a!.width).toBeLessThanOrEqual(m!.x);
  }
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

  // First the day at a glance (like Klook): places, hours, departure, cancellation.
  const highlights = page.locator("#highlights");
  for (const line of ["Elephant Jungle Sanctuary", "Big Buddha", "08:30 – 17:00", "Departure type: Hotel pickup", "Free cancellation (48 hours notice)"]) await expect(highlights.getByText(line, { exact: true })).toBeVisible();
  // Under it, the Highlights card (like Trip.com): the places' highlights, then what every Waydidi trip has.
  const title = highlights.getByRole("heading", { name: "Highlights" });
  await expect(title).toBeVisible();
  expect((await title.boundingBox())!.y).toBeGreaterThan((await highlights.getByText("Free cancellation (48 hours notice)", { exact: true }).boundingBox())!.y);
  await expect(highlights.getByText("Feed and bathe rescued elephants")).toBeVisible();
  await highlights.getByRole("button", { name: "See more" }).click();
  const sheet = page.getByRole("dialog", { name: "Highlights" });
  expect(await sheet.getByRole("listitem").allTextContents()).toEqual(["Feed and bathe rescued elephants", "45-metre marble Buddha with views over Chalong Bay",
    "Private: your own car and driver, only for your group", "Door to door: pickup and drop-off at your hotel",
    "Well planned: times follow each place's opening hours and the drive between them", "Flexible: free cancellation up to 48 hours before"]);
  if (process.env.SHOT_DIR) { await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-highlights-sheet-${info.project.name}.png` }); }
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(sheet).toHaveCount(0);
  if (process.env.SHOT_DIR) { await highlights.getByRole("button", { name: "View maps" }).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-glance-${info.project.name}.png` }); }
  await highlights.getByRole("button", { name: "View maps" }).click();
  const maps = page.getByRole("dialog", { name: "Route map" });
  await expect(maps).toBeVisible();
  // Full screen, like Klook: a card for the pickup and for each place with a location (Big Buddha has none).
  const mapBox = await maps.boundingBox(), view = page.viewportSize();
  expect([mapBox?.width, mapBox?.height]).toEqual([view?.width, view?.height]);
  const cards = maps.locator("button[type=button]").filter({ hasText: /Departure|Attraction/ });
  expect(await cards.allTextContents()).toEqual(["Kata Beach ResortDeparture · 08:30", "Elephant Jungle SanctuaryAttraction"]);
  await expect(cards.nth(1).locator("img")).toHaveAttribute("src", "/destinations/phuket.webp");
  await cards.nth(1).click();
  await expect(cards.nth(1)).toHaveAttribute("aria-current", "true");
  if (process.env.SHOT_DIR) { await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-maps-${info.project.name}.png` }); }
  await maps.getByRole("button", { name: "Close" }).click();
  await expect(maps).toHaveCount(0);
  // What to expect, like Klook: a line about the day and a bullet per place, then the day as a timeline on one grey line.
  const overview = page.locator("#expect");
  await expect(overview.getByRole("heading", { name: "What to expect" })).toBeVisible();
  await expect(overview.getByText("A private day with your own car and driver, picking you up at Kata Beach Resort.")).toBeVisible();
  await expect(overview.getByText("Visit Big Buddha", { exact: true })).toBeVisible();
  // No numbered photo board or meeting-point box any more.
  await expect(overview.getByText("Meeting point", { exact: true })).toHaveCount(0);
  await expect(overview.getByText(/depending on traffic/)).toHaveCount(0);
  if (process.env.SHOT_DIR) { await overview.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-expect-${info.project.name}.png` }); }
  const timeline = overview.getByRole("list").last();
  await expect(overview.getByText(/Google Maps key/)).toHaveCount(0); // no map in the timeline: it is behind "View maps"
  const steps = timeline.locator(":scope > li");
  await expect(steps).toHaveCount(4);
  await expect(steps.first()).toContainText("08:30 · Departure");
  await expect(steps.nth(1).getByRole("heading", { name: "Elephant Jungle Sanctuary" })).toBeVisible();
  await expect(steps.nth(1).getByText(/min drive|\d{2}:\d{2}/)).toHaveCount(0); // no times or drive lines on the places
  await expect(steps.nth(1).getByRole("img", { name: "Elephant Jungle Sanctuary" })).toBeVisible();
  await expect(steps.nth(1).getByText("+1", { exact: true })).toBeVisible(); // one more gallery photo
  await expect(steps.nth(2).getByRole("heading", { name: "Big Buddha" })).toBeVisible();
  await expect(steps.last()).toContainText("17:00 · Return");
  // Tapping a place's photo opens only that place's own photos full screen, from its first one.
  await steps.nth(2).getByRole("button", { name: "Big Buddha" }).click();
  const placeViewer = page.getByRole("dialog", { name: "Big Buddha" });
  expect(await placeViewer.getByRole("img").evaluateAll((els) => els.map((e) => e.getAttribute("src")))).toEqual(["/destinations/bangkok.webp", "/destinations/ayutthaya.webp"]);
  await expect(placeViewer.getByText(/^\d \/ \d$/)).toHaveText("1 / 2");
  await placeViewer.getByRole("button", { name: "Close" }).click();
  await expect(placeViewer).toHaveCount(0);
  await steps.nth(1).getByRole("button", { name: "Elephant Jungle Sanctuary" }).click();
  const elephantViewer = page.getByRole("dialog", { name: "Elephant Jungle Sanctuary" });
  expect(await elephantViewer.getByRole("img").evaluateAll((els) => els.map((e) => e.getAttribute("src")))).toEqual(["/destinations/phuket.webp", "/destinations/krabi.webp"]);
  await elephantViewer.getByRole("button", { name: "Close" }).click();
  await expect(elephantViewer).toHaveCount(0);
  await expect(page.getByRole("button", { name: "View full itinerary" })).toHaveCount(0);
  if (process.env.SHOT_DIR) { await overview.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-overview-${info.project.name}.png` }); await steps.nth(2).scrollIntoViewIfNeeded(); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-timeline-${info.project.name}.png` }); }
  await page.evaluate(() => window.scrollTo(0, 0));

  const tabs = page.getByRole("navigation", { name: "Trip sections" });
  expect(await tabs.getByRole("link").allTextContents()).toEqual(["Highlights", "What to expect", "Includes/Excludes"]);

  await tabs.getByRole("link", { name: "Includes/Excludes" }).click();
  const includes = page.locator("#includes");
  await expect(includes.getByRole("heading", { name: "What's included" })).toBeVisible();
  await expect(includes).toBeInViewport();
  await expect(tabs).toBeInViewport(); // the tab bar stays at the top while scrolling
  await expect(tabs.getByRole("link", { name: "Includes/Excludes" })).toHaveAttribute("aria-current", "location");
  await expect(includes.getByText("Entrance tickets: Elephant Jungle Sanctuary")).toBeVisible();
  await expect(includes.getByText("Entrance fee at Big Buddha, paid on the day")).toBeVisible();
  // Rows under What's included, filled from the trip itself: each opens its details in a sheet from the bottom.
  for (const name of ["Pick-up & meet-up information", "Before you book", "Terms & Conditions", "How to use"]) await expect(includes.getByRole("button", { name, exact: true })).toBeVisible();
  await includes.getByRole("button", { name: "Pick-up & meet-up information" }).click();
  const pickupSheet = page.getByRole("dialog", { name: "Pick-up & meet-up information" });
  await expect(pickupSheet.getByText("Pickup at 08:30 from Kata Beach Resort")).toBeVisible();
  await pickupSheet.getByRole("button", { name: "Close" }).click();
  await expect(pickupSheet).toHaveCount(0);
  await includes.getByRole("button", { name: "Before you book" }).click();
  const beforeSheet = page.getByRole("dialog", { name: "Before you book" });
  await expect(beforeSheet.getByText("Swimwear", { exact: true })).toBeVisible();
  await expect(beforeSheet.getByText("Bring swimwear for the elephant bath.")).toBeVisible();
  if (process.env.SHOT_DIR) { await page.waitForTimeout(600); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-row-sheet-${info.project.name}.png` }); }
  await beforeSheet.getByRole("button", { name: "Close" }).click();
  await expect(beforeSheet).toHaveCount(0);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-includes-${info.project.name}.png` });

  // The booking bar stays at the bottom of the screen: price, "Ask for a change" and "Book & Pay Now" (no heart).
  const bar = page.getByTestId("booking-bar");
  await expect(bar).toBeInViewport();
  expect(await bar.getByRole("button").allTextContents()).toEqual(["Total", "Ask for a change", "Book & Pay Now"]);
  await expect(bar.getByText(/^THB [\d,]+$/)).toBeVisible();
  // "Total (i)" on the left opens a sheet from the bottom that explains the price.
  await bar.getByRole("button", { name: /^Total/ }).click();
  await expect(page.getByRole("dialog").getByText("Total for your group")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  const barView = page.viewportSize()!;
  expect(Math.round((await bar.boundingBox())!.y + (await bar.boundingBox())!.height)).toBe(barView.height);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-booking-bar-${info.project.name}.png` });
  await bar.getByRole("button", { name: "Book & Pay Now" }).click();
  await expect(page.getByPlaceholder("Full name")).toBeInViewport(); // jumps to the details form
  await expect(bar).toHaveCount(0); // and steps aside so it never covers the pay button
  await page.getByRole("button", { name: "Back" }).click();
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Ask for a change" }).click();
  await expect(page.getByRole("textbox", { name: "Your request" })).toBeInViewport();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(tabs.getByRole("link", { name: "Booking" })).toHaveCount(0);
  // Every section runs full width: no rounded cards.
  for (const id of ["highlights", "expect", "includes"]) expect(await page.locator(`#${id}`).evaluate((el) => getComputedStyle(el).borderTopLeftRadius), id).toBe("0px");
  if (process.env.SHOT_DIR) { await page.waitForTimeout(1000); await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-end-${info.project.name}.png` }); }
});

test("places without highlights still get the Highlights card, under the day at a glance", async ({ page }) => {
  await page.goto(`/itinerary/${PLAIN_TOKEN}`);
  const section = page.locator("#highlights");
  for (const line of ["Big Buddha", "Wat Chalong", "Phuket Old Town", "Promthep Cape", "Departure type: Hotel pickup"]) await expect(section.getByText(line, { exact: true })).toBeVisible();
  await expect(section.getByRole("heading", { name: "Highlights" })).toBeVisible();
  await expect(section.getByText("Private: your own car and driver, only for your group")).toBeVisible();
});

test("end of the page: Help, Share and the copyright line", async ({ page, context }, info) => {
  await page.goto(`/itinerary/${TOKEN}`);
  await expect(page.getByRole("link", { name: "Help", exact: true })).toHaveAttribute("href", "/help");
  await expect(page.getByText(`© ${new Date().getFullYear()} Waydidi Travel. All rights reserved.`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Share this itinerary" })).toBeVisible();
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/itinerary-page-tools-${info.project.name}.png` });

  // Share copies the link where the phone's share sheet isn't available.
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => { Object.defineProperty(navigator, "share", { value: undefined }); });
  // Retry the click: right after load the page may not have hydrated yet, so the first click can do nothing.
  await expect(async () => {
    await page.getByRole("button", { name: "Share this itinerary" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Link copied" })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
});
