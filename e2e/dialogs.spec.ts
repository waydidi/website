import { expect, test } from "@playwright/test";

// Popups are Radix dialogs: focus moves inside, Esc closes, focus returns to the opener.
test("maintenance sign-in popup works with the keyboard", async ({ page }) => {
  await page.goto("/maintenance");
  await page.waitForLoadState("networkidle");
  const opener = page.getByRole("button", { name: "Sign in" });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Admin sign in" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Admin ID" })).toBeFocused();
  await expect(dialog.getByRole("checkbox", { name: "Stay signed in for 30 days" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
  await opener.click();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("header Transfer menu opens with the keyboard and lists its links", async ({ page, isMobile }) => {
  test.skip(isMobile, "the phone header uses the side menu instead");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const trigger = page.getByRole("navigation").getByRole("button", { name: "Transfer" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.getByRole("menu", { name: "Transfer" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Airport transfer" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});
