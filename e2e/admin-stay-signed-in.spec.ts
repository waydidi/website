import { expect, test } from "@playwright/test";

// Admin sign-in: "Stay signed in for 30 days" is ticked by default (without it the session ends after 8 hours and
// after 30 minutes without use), and it can still be unticked.
test.use({ storageState: { cookies: [], origins: [] } });

test("the admin sign-in page has Stay signed in ticked by default and it can be unticked", async ({ page }) => {
  await page.goto("/admin");
  const box = page.getByLabel("Stay signed in for 30 days");
  await expect(box).toBeChecked();
  await expect(async () => { await box.uncheck(); await expect(box).not.toBeChecked({ timeout: 1000 }); }).toPass({ timeout: 15_000 });
});
