import { expect, test } from "@playwright/test";

// Phones: the header shows the logo and the menu button only; Sign in is inside the menu.
test.skip(({ isMobile }) => !isMobile, "The phone header");

test("the phone header has no sign-in icon; Sign in is in the menu", async ({ page }) => {
  await page.goto("/about");
  const header = page.getByRole("banner");
  await expect(header.getByRole("button", { name: /open (the )?(navigation )?menu/i })).toBeVisible();
  await expect(header.locator('a[href="/account/sign-in"]:visible, a[href="/account"]:visible')).toHaveCount(0);
  // Tap until the page is interactive (a tap before hydration does nothing).
  await expect(async () => {
    await header.getByRole("button", { name: /open (the )?(navigation )?menu/i }).click();
    await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/account/sign-in");
});
