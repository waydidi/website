import { expect, test } from "@playwright/test";

// Phone: the bottom menu has a Planner tab (Trip planner) instead of Partners.
test.use({ storageState: "e2e/.auth/admin.json" });
test.skip(({ isMobile }) => !isMobile, "The bottom menu is the phone layout");

test("the phone menu lists Planner, not Partners, and Planner opens the trip planner", async ({ page }) => {
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Mobile admin sections" });
  await expect(async () => { await nav.getByRole("button", { name: "More" }).click(); await expect(nav.getByRole("link", { name: "Planner" })).toBeVisible({ timeout: 1500 }); }).toPass({ timeout: 15_000 });
  await expect(nav.getByRole("link", { name: "Partners" })).toHaveCount(0);
  await nav.getByRole("link", { name: "Planner" }).click();
  await expect(page).toHaveURL(/\/admin\/trips$/);
});
