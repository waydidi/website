import { expect, test } from "@playwright/test";
import { WHATSAPP_URL } from "../lib/contact";
import { closeDevNotice, devNotice } from "./dev-notice";

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

test("homepage under-development popup: WhatsApp link, focus kept inside, Esc closes", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const dialog = devNotice(page);
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("You cannot book through the website right now.");
  // Centred on every screen size (on phones too, not pinned to the bottom), with a gap at each side.
  const box = (await dialog.boundingBox())!, view = page.viewportSize()!;
  expect(Math.abs(box.y + box.height / 2 - view.height / 2)).toBeLessThan(2);
  expect(Math.abs(box.x + box.width / 2 - view.width / 2)).toBeLessThan(2);
  expect(box.x).toBeGreaterThanOrEqual(16);
  await expect(dialog.getByRole("link", { name: "Contact us on WhatsApp" })).toHaveAttribute("href", WHATSAPP_URL);
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.goto("/flights");
  await page.waitForLoadState("networkidle");
  await expect(devNotice(page)).toHaveCount(0);
});

test("header Transfer menu opens with the keyboard and lists its links", async ({ page, isMobile }) => {
  test.skip(isMobile, "the phone header uses the side menu instead");
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await closeDevNotice(page);
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

test("chat window opens, closes with Esc and returns focus to the chat button", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await closeDevNotice(page);
  const launcher = page.getByRole("button", { name: "Ask Waydidi" });
  await launcher.click();
  const chat = page.getByRole("dialog", { name: "Ask Waydidi" });
  await expect(chat).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(chat).toBeHidden();
  await expect(launcher).toBeFocused();
});

test("no chat button on the sign-in page", async ({ page }) => {
  await page.goto("/account/sign-in");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Welcome!" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ask Waydidi" })).toHaveCount(0);
});
