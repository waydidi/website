import { expect, test } from "@playwright/test";
import { closeDevNotice } from "./dev-notice";

// The header follows Daytrip's proportions: a 76px bar from 640px wide (70px on phones, as before), the logo 112px wide
// (84px on phones), content in a 1160px column, the full menu from 1280px and a "Menu" button below that.
test.skip(({ isMobile }) => isMobile, "Sizes are set below; the phone project only repeats the desktop browser");

const geometry = (page: import("@playwright/test").Page) => page.evaluate(() => {
  const box = (element: Element | null) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { x: rect.x, w: rect.width, h: rect.height };
  };
  const header = document.querySelector(".public-path-header header");
  const logo = header?.querySelector('[role="img"]') ?? null;
  const visible = (selector: string) => [...(header?.querySelectorAll(selector) ?? [])].filter(element => element.getBoundingClientRect().width > 0);
  return {
    header: box(header),
    logo: box(logo),
    column: document.documentElement.clientWidth,
    menuButton: visible("button[aria-controls=mobile-menu]").map(element => ({ text: (element as HTMLElement).innerText.trim(), ...box(element)! }))[0] ?? null,
    nav: visible("nav > a, nav > button, nav [role=img]").length,
    navText: visible("nav > a, nav > button").map(element => (element as HTMLElement).innerText.trim().replace(/\s+/g, " ")).filter(Boolean),
  };
});

const sizes: Array<[number, number, number, number, boolean]> = [
  // width, height, bar, logo width, full menu
  [1440, 900, 76, 112, true], [1280, 800, 76, 112, true], [1279, 800, 76, 112, false], [1024, 768, 76, 112, false],
  [768, 1024, 76, 112, false], [640, 900, 76, 112, false], [639, 900, 70, 84, false], [390, 844, 70, 84, false],
];
for (const [width, height, bar, logo, full] of sizes) {
  test(`header at ${width}px: ${bar}px bar, ${logo}px logo, ${full ? "full menu" : "Menu button"}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/about");
    await expect(page.locator(".public-path-header header")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const g = await geometry(page);
    expect(g.header!.h).toBe(bar);
    expect(Math.round(g.logo!.w)).toBe(logo);
    // Content stays in a 1160px column, centred; below that it keeps 16px (phones) or 20px of padding.
    const edge = width >= 640 ? 20 : 16;
    expect(Math.round(g.logo!.x)).toBe(Math.max(edge, Math.round((g.column - 1160) / 2)));
    if (full) {
      expect(g.menuButton).toBeNull();
      expect(g.navText.slice(0, 5)).toEqual(["Transfer", "Trip", "Destinations", "Travel guides", "About Waydidi"]);
      expect(g.navText.at(-1)).toBe("Check your booking");
    } else {
      expect(g.menuButton?.text).toBe("Menu");
      expect(g.menuButton!.h).toBe(40);
      expect(g.navText).toEqual([]);
    }
  });
}

test("the homepage header over the hero has the same bar height", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await closeDevNotice(page);
  expect(await page.locator("header").first().evaluate(element => element.getBoundingClientRect().height)).toBe(76);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.locator("header").first().evaluate(element => element.getBoundingClientRect().height)).toBe(70);
});

test("the language button is in the full menu and the Menu button opens the side menu", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/about");
  await expect(page.locator(".public-path-header header").getByRole("button", { name: /language|currency/i })).toBeVisible();
  await page.setViewportSize({ width: 768, height: 1024 });
  const menu = page.locator(".public-path-header header").getByRole("button", { name: /open navigation menu/i });
  await expect(async () => {
    await menu.click();
    await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});
