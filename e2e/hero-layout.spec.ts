import { expect, test } from "@playwright/test";
import { closeDevNotice } from "./dev-notice";

// The homepage hero follows Daytrip's proportions: the heading starts 44px under the 76px header (24px under the 70px
// phone header), a 36px heading (28px on phones), the white service-tab pill with the chosen tab in orange, one
// 64px-ish pill search bar from 1024px and a stacked 20px-radius card below that, in the same 1160px column as the
// header. Colours stay Waydidi orange.
test.skip(({ isMobile }) => isMobile, "Sizes are set below; the phone project only repeats the desktop browser");

const layout = (page: import("@playwright/test").Page) => page.evaluate(() => {
  const rect = (element: Element) => { const b = element.getBoundingClientRect(); return { x: b.x, y: b.y + scrollY, w: b.width, h: b.height }; };
  const h1 = document.querySelector("h1")!;
  const form = document.querySelector("#booking-search")!;
  const bar = form.children[1] as HTMLElement;
  const sub = h1.nextElementSibling as HTMLElement;
  return {
    h1: rect(h1), fontSize: getComputedStyle(h1).fontSize,
    sub: { ...rect(sub), shown: sub.getBoundingClientRect().height > 0 },
    tabs: rect(form.children[0]),
    bar: { ...rect(bar), radius: getComputedStyle(bar).borderRadius },
    hero: rect(h1.closest("section")!),
    logo: rect(document.querySelector("header [role=img]")!),
    column: document.documentElement.clientWidth,
  };
});

for (const [width, height] of [[1440, 900], [1280, 800], [1024, 768]]) {
  test(`hero at ${width}px: 36px heading, one-row pill bar, ${width >= 1280 ? "aligned with the header logo" : "20px side spacing"}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const g = await layout(page);
    expect(g.fontSize).toBe("36px");
    expect(Math.round(g.h1.y)).toBe(120);
    expect(g.sub.shown).toBe(true);
    expect(Math.round(g.sub.y)).toBe(168);
    expect(Math.round(g.tabs.y)).toBe(215);
    expect(g.bar.y).toBeGreaterThan(288);
    expect(g.bar.y).toBeLessThan(302);
    expect(g.bar.h, "one row, not stacked").toBeLessThan(80);
    expect(parseFloat(g.bar.radius), "a pill").toBeGreaterThan(100);
    expect(g.hero.h).toBeGreaterThan(465);
    expect(g.hero.h).toBeLessThan(510);
    // The heading starts exactly where the header logo does: the same 1160px column.
    expect(Math.round(g.h1.x)).toBe(Math.round(g.logo.x));
    expect(Math.round(g.h1.x)).toBe(Math.max(20, Math.round((g.column - 1160) / 2)));
  });
}

test("hero at 768px: stacked 20px-radius card under the tabs", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const g = await layout(page);
  expect(g.fontSize).toBe("36px");
  expect(Math.round(g.h1.y)).toBe(120);
  expect(g.sub.shown).toBe(true);
  expect(g.bar.radius).toBe("20px");
  expect(g.bar.h, "stacked fields").toBeGreaterThan(280);
  expect(g.bar.h).toBeLessThan(380);
  expect(Math.round(g.h1.x)).toBe(20);
});

test("hero at 390px: 28px heading, no subtitle, card under the tabs, heading 24px under the header", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const g = await layout(page);
  expect(g.fontSize).toBe("28px");
  expect(Math.round(g.h1.y)).toBe(94);
  expect(g.sub.shown).toBe(false);
  expect(g.bar.radius).toBe("20px");
  expect(g.bar.h).toBeGreaterThan(280);
  expect(g.bar.h).toBeLessThan(380);
  expect(Math.round(g.h1.x)).toBe(20);
});

test("the service tabs are a white pill with the chosen one in orange, and the hero stays Waydidi orange", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await closeDevNotice(page);
  const tab = (name: string) => page.locator("#booking-search").getByRole("button", { name });
  const fill = (name: string) => tab(name).evaluate(element => getComputedStyle(element).backgroundColor);
  const pill = await page.locator("#booking-search").evaluate(form => getComputedStyle(form.children[0]).backgroundColor);
  expect(pill, "the white pill behind both tabs").toBe("rgb(255, 255, 255)");
  expect(await fill("Transfer")).toBe("rgb(255, 138, 5)");
  expect(await fill("By the hour")).toBe("rgba(0, 0, 0, 0)");
  await tab("By the hour").click();
  await expect.poll(() => fill("By the hour")).toBe("rgb(255, 138, 5)");
  expect(await fill("Transfer")).toBe("rgba(0, 0, 0, 0)");
  expect(await page.locator("h1").evaluate(element => getComputedStyle(element.closest("section")!).backgroundColor)).toBe("rgb(255, 138, 5)");
});
