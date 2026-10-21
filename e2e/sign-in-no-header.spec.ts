import { expect, test } from "@playwright/test";

// Sign in / register: no site header, just the orange Waydidi logo, and the "Manage every trip | Faster booking" line.
test("the sign-in page has no site header, keeps the orange logo and the two benefits", async ({ page }) => {
  await page.goto("/account/sign-in");
  await expect(page.getByRole("heading", { name: "Sign in / register" })).toBeVisible();
  await expect(page.locator(".public-path-header")).toHaveCount(0);
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByText("Manage every trip")).toBeVisible();
  await expect(page.getByText("Faster booking")).toBeVisible();
  const logo = page.getByRole("link", { name: "Waydidi home" });
  await expect(logo).toBeVisible();
  expect(await logo.evaluate((el) => getComputedStyle(el).color)).toBe(await page.evaluate(() => { const probe = document.createElement("span"); probe.className = "text-brand"; document.body.append(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; }));
});
