import { expect, test } from "@playwright/test";
import { closeDevNotice } from "./dev-notice";

// The "Chat with us" button stays in the bottom-right corner while the page scrolls, with no animation.
test("the chat button stays at the bottom right of the screen at every scroll position, without an echo", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await closeDevNotice(page);
  const button = page.locator("[data-chat-launcher]");
  await expect(button).toBeVisible();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (const y of [0, 600, Math.floor(height / 2), height]) {
    await page.evaluate((top) => window.scrollTo(0, top), y);
    await page.waitForTimeout(150);
    const [box, view] = await Promise.all([button.boundingBox(), page.evaluate(() => ({ w: document.documentElement.clientWidth, h: window.innerHeight }))]);
    expect(view.h - (box!.y + box!.height), `bottom gap at scroll ${y}`).toBeLessThanOrEqual(40);
    expect(view.w - (box!.x + box!.width), `right gap at scroll ${y}`).toBeLessThanOrEqual(30);
  }
  const animated = await button.evaluate((el) => [el, ...el.querySelectorAll("*")].filter((n) => getComputedStyle(n).animationName !== "none").length);
  expect(animated, "no echo or other animation on the button").toBe(0);
});
