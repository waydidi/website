import { expect, test } from "@playwright/test";

// Admin → a trip whose places do not fit one day → "Split into days": asks first, then shows the days.
test.use({ storageState: "e2e/.auth/admin.json" });
test.skip(({ isMobile }) => isMobile, "Checked on the desktop layout");

const stop = (i: number) => ({ id: `s${i}`, kind: "attraction", name: `Place ${i}`, attractionId: `a${i}`, lat: 7.85, lng: 98.33, durationMin: 180, priority: "must" });
const input = { title: "Phuket highlights", area: "Phuket", tripDate: "2026-12-01", startTime: "08:00", pickupText: "Hilton Phuket", pickupLat: 7.84, pickupLng: 98.33, endText: null, endLat: null, endLng: null,
  durationHours: 8, adults: 2, children: 0, bags: 2, vehicle: "economy_sedan", language: "en", customerName: null, customerEmail: null, customerPhone: null, notes: null,
  stops: [1, 2, 3, 4, 5].map(stop), transportPrice: 12000, discount: 0, holdDays: 7, isTemplate: false, templateName: null };
const meta = { id: "t1", ref: "TP-SPLIT1", status: "draft", token: "T", version: 0, sentAt: null, viewedAt: null, acceptedAt: null, changeRequest: null, bookingReference: null, agencyId: null,
  commissionPercent: 0, isTemplate: false, dayNumber: 1, groupId: null, thankedAt: null, feedbackRating: null, feedbackComment: null };
const over = { stops: input.stops, plan: { stops: [], returnTravel: 0, returnAt: 1500, startAt: 480, endLimit: 960, overBy: 540, totalDrive: 0, totalActivity: 900, totalWait: 0,
  problems: [{ level: "error", message: "The trip ends at 01:00, 9 hr after the booked end time of 16:00." }] }, source: "estimate", fees: { included: 0, onSite: 0 }, total: 12000,
  suggestedTransport: null, packing: [], alternatives: [{ label: "Remove Place 5", returnAt: 1260, fits: false, stops: input.stops.slice(0, 4) }] };

test("a trip that runs over offers to split into days; staff confirm and see the days", async ({ page }) => {
  let split = false, asked = "";
  await page.route("**/api/admin/attractions", (route) => route.fulfill({ json: { attractions: [] } }));
  await page.route("**/api/admin/suppliers", (route) => route.fulfill({ json: { suppliers: [] } }));
  await page.route("**/api/admin/trips/plan", (route) => route.fulfill({ json: over }));
  await page.route("**/api/admin/trips/t1", async (route) => {
    if (route.request().method() === "POST") { asked = JSON.parse(route.request().postData() ?? "{}").action; split = true; return route.fulfill({ json: { ok: true, id: "t1", days: 3, fits: true } }); }
    const group = split ? [1, 2, 3].map((n) => ({ id: n === 1 ? "t1" : `t${n}`, dayNumber: n, tripDate: `2026-12-0${n}`, total: 4000, status: "draft", stops: n === 3 ? 1 : 2 })) : [];
    return route.fulfill({ json: { trip: { ...meta, groupId: split ? "t1" : null }, input: split ? { ...input, stops: input.stops.slice(0, 2) } : input, versions: [], supplierContacts: {}, group } });
  });
  await page.goto("/admin/trips/t1");
  const option = page.getByText(/Split into days: places near each other go on the same day/);
  await expect(option).toBeVisible();
  let dialog = "";
  page.once("dialog", (d) => { dialog = d.message(); void d.accept(); });
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expect(page.getByRole("navigation", { name: "Trip days" }).getByRole("link", { name: /^Day 3/ })).toBeVisible();
  expect(asked).toBe("split_days");
  expect(dialog).toMatch(/shared across the days by each day's hourly rate, so the total stays the same/);
  await expect(page.getByText("Multi-day trip · total THB 12,000")).toBeVisible();
  // A trip that already has several days does not offer it again.
  await expect(option).toHaveCount(0);
});
