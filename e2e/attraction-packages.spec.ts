import { expect, test } from "@playwright/test";

// Admin → Attractions: packages show only for a place that needs booking; several packages, each with a name,
// price per person, optional child price, duration and optional start time.
test.use({ storageState: "e2e/.auth/admin.json" });
test.skip(({ isMobile }) => isMobile, "Checked on the desktop layout");

test("a place that needs booking gets several packages with price, duration and an optional start time", async ({ page }) => {
  let posted: { bookingRequired?: boolean; programs?: Record<string, unknown>[] } | null = null;
  await page.route("**/api/admin/attractions", async (route) => {
    if (route.request().method() === "POST") { posted = JSON.parse(route.request().postData() ?? "{}"); return route.fulfill({ json: { ok: true, id: "pes" } }); }
    return route.fulfill({ json: { attractions: [], suppliers: [] } });
  });
  await page.goto("/admin/attractions");
  await expect(async () => { await page.getByRole("button", { name: "Add attraction" }).click(); await expect(page.getByRole("checkbox", { name: "Booking required" })).toBeVisible({ timeout: 1500 }); }).toPass({ timeout: 15_000 });

  // Not booking required: no packages to add.
  await expect(page.getByRole("button", { name: "Add package" })).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Booking required" }).check();
  const add = page.getByRole("button", { name: "Add package" });
  await expect(add).toBeVisible();

  await add.click();
  await page.getByLabel("Package name").nth(0).fill("Half-day morning");
  await page.getByLabel("Price per person (THB)").nth(0).fill("3000");
  await expect(page.getByLabel("Child price (THB)").nth(0)).toHaveAttribute("placeholder", "Same as adult");
  await page.getByLabel("Child price (THB)").nth(0).fill("1500");
  await page.getByLabel("Duration (minutes)").nth(0).fill("240");
  await page.getByLabel("Start time (optional)").nth(0).fill("09:00");

  await add.click();
  await page.getByLabel("Package name").nth(1).fill("Full day");
  await page.getByLabel("Price per person (THB)").nth(1).fill("5000");
  await page.getByLabel("Duration (minutes)").nth(1).fill("420");

  await page.getByLabel("Internal name", { exact: true }).fill("Phuket Elephant Sanctuary");
  await page.getByRole("button", { name: /^Save/ }).last().click();
  await expect.poll(() => posted?.programs?.length).toBe(2);
  expect(posted!.bookingRequired).toBe(true);
  expect(posted!.programs!.map((p) => [p.name, p.feeAdult, p.feeChild, p.durationMin, p.feeIncluded, (p.sessions as { time: string }[]).map((s) => s.time)])).toEqual([
    ["Half-day morning", 3000, 1500, 240, true, ["09:00"]],
    ["Full day", 5000, 5000, 420, true, []],
  ]);
});

test("Always open hides the hours and saves 00:00–23:59 every day; unticking asks for hours again", async ({ page }) => {
  let posted: { openTime?: string | null; closeTime?: string | null; lastEntry?: string | null; closedDays?: number[] } | null = null;
  await page.route("**/api/admin/attractions", async (route) => {
    if (route.request().method() === "POST") { posted = JSON.parse(route.request().postData() ?? "{}"); return route.fulfill({ json: { ok: true, id: "x" } }); }
    return route.fulfill({ json: { attractions: [], suppliers: [] } });
  });
  await page.goto("/admin/attractions");
  const always = page.getByRole("checkbox", { name: /Always open/ });
  await expect(async () => { await page.getByRole("button", { name: "Add attraction" }).click(); await expect(always).toBeVisible({ timeout: 1500 }); }).toPass({ timeout: 15_000 });
  await page.getByRole("button", { name: "Mon", exact: true }).click(); // closed on Mondays, before ticking
  await always.check();
  await expect(page.getByLabel("Opens")).toHaveCount(0);
  await expect(page.getByText("Closed every")).toHaveCount(0);
  await page.getByLabel("Internal name", { exact: true }).fill("Patong Beach");
  await page.getByRole("button", { name: /^Save/ }).last().click();
  await expect.poll(() => posted?.openTime).toBe("00:00");
  expect([posted!.closeTime, posted!.lastEntry, posted!.closedDays]).toEqual(["23:59", null, []]);
});

test("unticking Always open shows empty hours to fill in", async ({ page }) => {
  await page.route("**/api/admin/attractions", (route) => route.fulfill({ json: { attractions: [], suppliers: [] } }));
  await page.goto("/admin/attractions");
  const always = page.getByRole("checkbox", { name: /Always open/ });
  await expect(async () => { await page.getByRole("button", { name: "Add attraction" }).click(); await expect(always).toBeVisible({ timeout: 1500 }); }).toPass({ timeout: 15_000 });
  await always.check();
  await always.uncheck();
  await expect(page.getByLabel("Opens")).toHaveValue("");
  await expect(page.getByLabel("Closes")).toHaveValue("");
});
