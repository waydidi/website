import { expect, test } from "@playwright/test";
import { closeDevNotice } from "./dev-notice";

// The "Multi-city trip" button sits under the search box, like Daytrip's. It opens the multi-city form in place at
// /?tripType=multiCity, the service tabs return to the normal search, and the old "All of Thailand · Fixed price ·
// Cancellation terms apply" line is gone from the hero. The button shows only with MULTI_CITY_REQUESTS=1; the browser
// test config switches that on for the test server.
test.skip(({ isMobile }) => isMobile, "Sizes are set below; the phone project only repeats the desktop browser");

const heroState = (page: import("@playwright/test").Page) => page.evaluate(() => {
  const form = document.querySelector("#booking-search")!;
  const bar = form.children[1].getBoundingClientRect();
  const button = [...form.querySelectorAll("button")].find((b) => /multi-city trip/i.test(b.textContent ?? ""));
  const rect = button?.getBoundingClientRect();
  const hero = document.querySelector("h1")!.closest("section")!;
  return {
    button: rect ? { x: rect.x, top: rect.top, height: rect.height } : null,
    barLeft: bar.x, barBottom: bar.bottom,
    tabs: [...form.children[0].querySelectorAll("button")].map((b) => (b.textContent ?? "").trim()),
    heroText: hero.textContent ?? "",
  };
});

test("the Multi-city trip button is under the search box, and the trust line is gone", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await closeDevNotice(page);
  const state = await heroState(page);
  expect(state.button, "the button is on the page").not.toBeNull();
  expect(state.button!.x, "left-aligned with the search box").toBeCloseTo(state.barLeft, -1);
  expect(state.button!.top, "right under the search box").toBeGreaterThan(state.barBottom);
  expect(state.button!.top - state.barBottom, "close to the box").toBeLessThan(30);
  expect(state.button!.height).toBe(40);
  expect(state.tabs, "multi-city is a button, not a third tab").toEqual(["Transfer", "By the hour"]);
  for (const gone of ["All of Thailand", "Fixed price", "Cancellation terms apply"]) expect(state.heroText).not.toContain(gone);
});

test("choosing it opens the multi-city form at /?tripType=multiCity, and the Transfer tab goes back", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await closeDevNotice(page);
  const button = page.getByRole("button", { name: "Multi-city trip" });
  await expect(async () => {
    await button.click();
    await expect(page.getByTestId("multi-city-form")).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  expect(new URL(page.url()).searchParams.get("tripType")).toBe("multiCity");
  await expect(button, "the button gives way to the form").toBeHidden();
  const form = page.getByTestId("multi-city-form");
  await expect(form.getByRole("listitem"), "two legs to start").toHaveCount(2);
  await form.getByRole("button", { name: "Add another leg" }).click();
  await expect(form.getByRole("listitem")).toHaveCount(3);
  await page.locator("#booking-search").getByRole("button", { name: "Transfer" }).click();
  await expect(form).toBeHidden();
  expect(new URL(page.url()).searchParams.has("tripType")).toBe(false);
  await expect(button).toBeVisible();
});

test("a link to /?tripType=multiCity opens the form straight away", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?tripType=multiCity");
  await page.waitForLoadState("networkidle");
  await closeDevNotice(page);
  await expect(page.getByTestId("multi-city-form")).toBeVisible();
  await expect(page.getByRole("button", { name: "Multi-city trip" })).toBeHidden();
});

test("the form sends every leg and the contact details, then confirms", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const sent: Array<Record<string, unknown>> = [];
  await page.route("**/api/multi-city-requests", async (route) => { sent.push(route.request().postDataJSON()); await route.fulfill({ status: 201, json: { ok: true } }); });
  await page.goto("/?tripType=multiCity");
  await page.waitForLoadState("networkidle");
  await closeDevNotice(page);
  const form = page.getByTestId("multi-city-form");
  await expect(form).toBeVisible();
  const legs = form.getByRole("listitem");
  const when = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  for (const [index, [from, to]] of [["Bangkok", "Pattaya"], ["Pattaya", "Hua Hin"]].entries()) {
    await legs.nth(index).getByLabel("From").fill(from);
    await legs.nth(index).getByLabel("To").fill(to);
    await legs.nth(index).getByLabel("Date").fill(when);
    await legs.nth(index).getByLabel("Pickup time").fill("09:00");
  }
  await form.getByLabel("Full name").fill("Test Customer");
  await form.getByLabel("WhatsApp or phone").fill("+66 80 000 0000");
  await form.getByLabel("Email").fill("test@example.invalid");
  await form.getByRole("button", { name: "Request a price" }).click();
  await expect(page.getByRole("status")).toContainText("Request received");
  expect(sent).toHaveLength(1);
  const body = sent[0] as { legs: Array<{ from: string; to: string }>; name: string };
  expect(body.legs.map((leg) => `${leg.from} > ${leg.to}`)).toEqual(["Bangkok > Pattaya", "Pattaya > Hua Hin"]);
  expect(body.name).toBe("Test Customer");
});

test("city pages get the same button and no trust line", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/destinations/bangkok");
  await page.waitForLoadState("networkidle");
  const state = await heroState(page);
  expect(state.button, "the button is on the city page").not.toBeNull();
  expect(state.tabs).toEqual(["Transfer", "By the hour"]);
  for (const gone of ["All of Thailand", "Fixed price", "Cancellation terms apply"]) expect(state.heroText).not.toContain(gone);
});

test("on a phone the button sits under the search card too", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await closeDevNotice(page);
  const state = await heroState(page);
  expect(state.button).not.toBeNull();
  expect(state.button!.top).toBeGreaterThan(state.barBottom);
  expect(state.button!.x).toBeLessThan(40);
});
