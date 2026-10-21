import { expect, test } from "@playwright/test";

const plan = { stops: [], plan: { stops: [], returnTravel: 0, returnAt: 480, startAt: 480, endLimit: 960, overBy: 0, totalDrive: 0, totalActivity: 0, totalWait: 0, problems: [] }, source: "estimate", fees: { included: 0, onSite: 0 }, total: 0, suggestedTransport: null, packing: [], alternatives: [] };

test.describe("signed out", () => {
  test("the chat-to-plan route refuses people who are not staff", async ({ request, baseURL }) => {
    const res = await request.post("/api/admin/trips/from-chat", { data: { text: "We want to see the Big Buddha" }, headers: { origin: baseURL!, "content-type": "application/json" } });
    expect(res.status()).toBe(401);
  });
});

test.describe("staff", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });

  test("paste a chat: a progress bar runs, then the plan is filled in with what is still missing", async ({ page }) => {
    await page.route("**/api/admin/attractions", (route) => route.fulfill({ json: { attractions: [] } }));
    await page.route("**/api/admin/trips/plan", (route) => route.fulfill({ json: plan }));
    await page.route("**/api/admin/trips/from-chat", async (route) => {
      await new Promise((r) => setTimeout(r, 1200));
      await route.fulfill({ json: { draft: { title: "Phuket highlights day", area: "", tripDate: null, startTime: "09:00", durationHours: 8, adults: 3, children: 0, bags: 2, pickupText: "", customerName: "Mei", notes: "Has a toddler.", language: "en",
        stops: [{ id: "a1", kind: "custom", name: "Elephant sanctuary", durationMin: 45, priority: "must" }], unmatched: ["Elephant sanctuary"], suggested: false, missing: ["date", "pickup place"] } } });
    });
    await page.goto("/admin/trips/new");
    const box = page.getByLabel("Customer chat");
    await expect(async () => { await box.fill("Hi, 3 of us, we would love the elephant sanctuary, tomorrow"); await expect(page.getByRole("button", { name: "Make a plan" })).toBeEnabled({ timeout: 1000 }); }).toPass({ timeout: 15_000 });
    await page.getByRole("button", { name: "Make a plan" }).click();
    await expect(page.getByRole("progressbar", { name: "Making the plan" })).toBeVisible();
    await expect(page.getByText("Reading the chat…")).toBeVisible();
    await expect(page.getByText(/Plan ready · 1 stop/)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Elephant sanctuary/).first()).toBeVisible();
    await expect(page.getByText(/Still to fill in: date, pickup place/)).toBeVisible();
    await expect(page.getByLabel("Adults")).toHaveValue("3");
  });

  test("an unreadable answer shows a plain error and keeps the pasted chat", async ({ page }) => {
    await page.route("**/api/admin/attractions", (route) => route.fulfill({ json: { attractions: [] } }));
    await page.route("**/api/admin/trips/from-chat", (route) => route.fulfill({ status: 422, json: { error: "The planner's answer could not be read. Try again, or add stops by hand." } }));
    await page.goto("/admin/trips/new");
    const box = page.getByLabel("Customer chat");
    await expect(async () => { await box.fill("Hello, we need a day trip please"); await expect(page.getByRole("button", { name: "Make a plan" })).toBeEnabled({ timeout: 1000 }); }).toPass({ timeout: 15_000 });
    await page.getByRole("button", { name: "Make a plan" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "could not be read" })).toBeVisible();
    await expect(box).toHaveValue("Hello, we need a day trip please");
  });
});
