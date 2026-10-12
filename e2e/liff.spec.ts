import { expect, test } from "@playwright/test";

// The LINE (LIFF) pages. Locally LINE_LIFF_ID is not set, so /liff explains that instead of loading LINE.
test("/liff without a LIFF ID says it is not set up", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const res = await page.goto("/liff");
  expect(res?.status()).toBeLessThan(400);
  await expect(page.getByText("Waydidi in LINE is not set up yet")).toBeVisible();
  await expect(page.locator("header").first()).toBeHidden();
  expect(errors).toEqual([]);
});

test("/liff/trips sends signed-out visitors back to the LINE sign-in", async ({ page }) => {
  await page.goto("/liff/trips");
  await expect(page).toHaveURL(/\/liff$/);
});

test("the LINE SDK is allowed on /liff only", async ({ request }) => {
  const liff = await request.get("/liff");
  const home = await request.get("/");
  const liffCsp = liff.headers()["content-security-policy"] ?? "";
  const homeCsp = home.headers()["content-security-policy"] ?? "";
  test.skip(!liffCsp, "security headers are added by the Worker, not the dev server");
  expect(liffCsp).toContain("https://static.line-scdn.net");
  expect(homeCsp).not.toContain("line-scdn");
});
