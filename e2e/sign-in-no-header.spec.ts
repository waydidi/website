import { expect, test } from "@playwright/test";

// Log in / sign up: no site header, no logo, and the "Manage every trip | Faster booking" line.
test("the sign-in page has no site header, has no logo and keeps the two benefits", async ({ page }) => {
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
  // No logo either: the page is just the form.
  await expect(page.getByRole("img", { name: "Waydidi" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Waydidi home" })).toHaveCount(0);
});

test("the chat bubble is still on public pages", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("[data-chat-launcher]")).toBeVisible({ timeout: 20_000 });
});
