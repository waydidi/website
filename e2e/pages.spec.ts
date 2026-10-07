import { expect, test } from "@playwright/test";

// Every important page must load without a server error or a browser console error.
const PAGES = ["/", "/flights", "/partners", "/destinations", "/blog", "/refund-policy", "/terms", "/privacy", "/maintenance", "/account/sign-in", "/admin"];

for (const path of PAGES) {
  test(`${path} loads cleanly`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(path);
    expect(res?.status(), `HTTP status for ${path}`).toBeLessThan(400);
    await expect(page.locator("main").first()).toBeVisible();
    await expect(page.locator("h1").first()).toBeVisible();
    expect(errors, `uncaught errors on ${path}`).toEqual([]);
  });
}

test("account page sends signed-out visitors to sign in", async ({ page }) => {
  await page.goto("/account");
  await expect(page).toHaveURL(/\/account\/sign-in/);
});

test("unknown page shows 404", async ({ page }) => {
  const res = await page.goto("/this-page-does-not-exist-xyz");
  expect(res?.status()).toBe(404);
});
