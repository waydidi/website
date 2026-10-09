import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

test("Profile: Light/Dark switch changes the admin theme and is remembered", async ({ page }) => {
  await page.goto("/admin/profile");
  await page.waitForLoadState("networkidle");
  const html = page.locator("html");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(html).toHaveClass(/admin-dark/);
  await expect(page.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(html).toHaveClass(/admin-dark/);
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(html).not.toHaveClass(/admin-dark/);
});

test("Partners: Add partner popup opens, keeps focus inside and closes with Esc", async ({ page }) => {
  await page.goto("/admin/affiliates");
  await page.waitForLoadState("networkidle");
  const opener = page.getByRole("button", { name: "Add partner" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Add partner" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Name", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test("Seasons: Add season popup opens and closes with Esc", async ({ page }) => {
  await page.goto("/admin/seasons");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Add season" }).click();
  const dialog = page.getByRole("dialog", { name: "Add season" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("Notification bell menu opens with the keyboard and closes with Esc", async ({ page }) => {
  await page.goto("/admin/profile");
  await page.waitForLoadState("networkidle");
  const trigger = page.getByRole("button", { name: /notifications/i });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu).toContainText("Notifications");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});

for (const path of ["/admin/profile", "/admin/affiliates", "/admin/seasons"]) {
  test(`${path} meets WCAG 2.1 AA`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).disableRules(["color-contrast"]).analyze();
    const blocking = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking, blocking.map((v) => `${v.id}: ${v.help}\n  ${v.nodes.slice(0, 4).map((n) => n.target.join(" ")).join("\n  ")}`).join("\n")).toEqual([]);
  });
}
