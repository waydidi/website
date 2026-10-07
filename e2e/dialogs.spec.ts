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
