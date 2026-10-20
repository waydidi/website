import { expect, test } from "@playwright/test";

// Admin → Trips → New trip, on a phone: only the essential fields first, one step at a time, and places added with one tap.
test.use({ storageState: "e2e/.auth/admin.json" });
test.skip(({ isMobile }) => !isMobile, "The step-by-step layout is the phone layout");

const attraction = (id: string, name: string, usedIn: number) => ({
  id, name, customerName: name, area: "Phuket", category: "Sightseeing", tags: [], status: "active", programs: [], openTime: "08:00", closeTime: "18:00", lastEntry: null,
  closedDays: [], durationMin: 60, arrivalBufferMin: 0, latitude: 7.84, longitude: 98.31, coverImage: null, description: "", usedIn, bookingRequired: false,
});

test("a new trip starts with the essentials, steps on a phone, and adds places with one tap", async ({ page }) => {
  await page.route("**/api/admin/attractions", (route) => route.fulfill({ json: { attractions: [attraction("a1", "Big Buddha", 1), attraction("a2", "Old Town", 9), attraction("a3", "Promthep Cape", 4)] } }));
  await page.route("**/api/admin/trips/plan", (route) => route.fulfill({ json: { stops: [], plan: { stops: [], returnTravel: 0, returnAt: 480, startAt: 480, endLimit: 960, overBy: 0, totalDrive: 0, totalActivity: 0, totalWait: 0, problems: [] }, source: "estimate", fees: { included: 0, onSite: 0 }, total: 0, suggestedTransport: null, packing: [], alternatives: [] } }));
  await page.goto("/admin/trips/new");

  // Step 1: only the essentials; the rest is folded away.
  await expect(page.getByLabel("Pickup time")).toBeVisible();
  await expect(page.getByLabel("Adults")).toBeVisible();
  await expect(page.getByLabel("Children")).toHaveCount(0);
  await expect(page.getByLabel("Customer name")).toHaveCount(0);
  // The page may still be starting up: click until it responds.
  await expect(async () => { await page.getByRole("button", { name: /More details/ }).click(); await expect(page.getByLabel("Children")).toBeVisible({ timeout: 1500 }); }).toPass({ timeout: 15_000 });
  await expect(page.getByLabel("Customer name")).toBeVisible();

  // Step 2: the itinerary, with the most used places to tap.
  await page.getByRole("button", { name: "Next: add stops" }).click();
  await expect(page.getByText("No stops yet.")).toBeVisible();
  await expect(page.getByLabel("Pickup time")).toBeHidden();
  const first = page.getByRole("button", { name: /^\s*Old Town$/ }).first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page.getByText("No stops yet.")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "2 Stops (1)" })).toBeVisible();

  // The picker adds several places without closing, most used first, and marks what is added.
  await page.getByRole("button", { name: "Add attraction" }).click();
  const rows = page.getByRole("dialog").locator("li");
  await expect(rows.first()).toContainText("Old Town");
  await expect(rows.first()).toContainText("Added");
  await page.getByRole("button", { name: "Add Promthep Cape now" }).click();
  await expect(page.getByRole("button", { name: /Done · 2 in the trip/ })).toBeVisible();
  await page.getByRole("button", { name: /Done · 2 in the trip/ }).click();
  await expect(page.getByRole("button", { name: "2 Stops (2)" })).toBeVisible();

  // Step 3.
  await page.getByRole("button", { name: "Next: price and send" }).click();
  await expect(page.getByRole("heading", { name: "Price" })).toBeVisible();
});
