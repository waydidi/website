import { expect, test } from "@playwright/test";

// An old browser has no CSS cascade layers; remove them before any page script runs.
const makeOld = (page: import("@playwright/test").Page) =>
  page.addInitScript(() => { Object.defineProperty(window, "CSSLayerBlockRule", { value: undefined, configurable: true }); });

test("an old browser is sent to the explanation page, can continue anyway, and is not sent back", async ({ page }) => {
  await makeOld(page);
  await page.goto("/terms?tab=1");
  await expect(page).toHaveURL(/\/unsupported\.html\?redirect=%2Fterms%3Ftab%3D1$/);
  await expect(page.getByRole("heading", { name: "Please update your browser" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "กรุณาอัปเดตเบราว์เซอร์" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "请更新您的浏览器" })).toBeVisible();
  await page.getByRole("link", { name: /Try this page anyway/ }).click();
  await expect(page).toHaveURL(/\/terms\?tab=1$/);
  await page.waitForTimeout(1500);
  expect(new URL(page.url()).pathname).toBe("/terms");
});

test("a modern browser is never redirected", async ({ page }) => {
  await page.goto("/terms");
  await page.waitForTimeout(1000);
  expect(new URL(page.url()).pathname).toBe("/terms");
});

test("the explanation page will not send a visitor to another site", async ({ page }) => {
  for (const target of ["//evil.test", "https://evil.test", "/\\evil.test"]) {
    await page.goto("/unsupported.html?redirect=" + encodeURIComponent(target));
    const link = page.getByRole("link", { name: /Try this page anyway/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/");
  }
});

test("the explanation page has support contacts and is not indexed", async ({ page, request }) => {
  await page.goto("/unsupported.html");
  await expect(page.locator('a[href="tel:+66632064884"]').first()).toBeVisible();
  await expect(page.locator('a[href="mailto:support@waydidi.com"]').first()).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  expect((await request.get("/unsupported.html")).status()).toBe(200);
});
