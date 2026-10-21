import { expect, test } from "@playwright/test";

// Log in / sign up: no site header, just the orange Waydidi logo, and the "Manage every trip | Faster booking" line.
test("the sign-in page has no site header, keeps the orange logo and the two benefits", async ({ page }) => {
  await page.goto("/account/sign-in");
  await expect(page.getByRole("heading", { name: "Welcome!" })).toBeVisible();
  await expect(page.locator(".public-path-header")).toHaveCount(0);
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByText("Manage every trip")).toBeVisible();
  // No chat bubble on this page; it still shows on the home page.
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-chat-launcher]")).toHaveCount(0);
  await expect(page.getByText("Faster booking")).toBeVisible();
  await expect(page.getByText("Don't have an account?")).toBeVisible();
  // 10% smaller than the old 56 px field.
  const field = await page.getByRole("textbox", { name: "Email address" }).boundingBox();
  expect(field!.height).toBeGreaterThan(48); expect(field!.height).toBeLessThan(52);
  await expect(async () => { await page.getByRole("button", { name: "Sign up" }).first().click(); await expect(page.getByText("Already have an account?")).toBeVisible({ timeout: 1500 }); }).toPass({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Welcome!" })).toBeVisible();
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Don't have an account?")).toBeVisible();
  const logo = page.getByRole("link", { name: "Waydidi home" });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((el) => getComputedStyle(el).color)).toBe(await page.evaluate(() => { const probe = document.createElement("span"); probe.className = "text-brand"; document.body.append(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; }));
});

test("the chat bubble is still on public pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-chat-launcher]")).toBeVisible({ timeout: 20_000 });
});
