import { expect, test } from "@playwright/test";

// Phone: the bottom menu's "Setting" tab opens the profile page; the owner finds the maintenance switch there.
test.use({ storageState: "e2e/.auth/admin.json" });
test.skip(({ isMobile }) => !isMobile, "The bottom menu is the phone layout");

test("the owner sees the maintenance mode switch from the phone Setting tab", async ({ page }) => {
  await page.goto("/admin");
  const nav = page.getByRole("navigation", { name: "Mobile admin sections" });
  await expect(async () => { await nav.getByRole("button", { name: "More" }).click(); await expect(nav.getByRole("link", { name: "Setting" })).toBeVisible({ timeout: 1500 }); }).toPass({ timeout: 15_000 });
  await nav.getByRole("link", { name: "Setting" }).click();
  await expect(page).toHaveURL(/\/admin\/profile$/);
  await expect(page.getByRole("switch", { name: "Maintenance mode" })).toBeVisible();
  await expect(page.getByRole("link", { name: "All settings" })).toHaveAttribute("href", "/admin/settings");
});
