import { expect, test } from "@playwright/test";
import { closeDevNotice } from "./dev-notice";

// Every city page (/destinations/<city>) has the same space above and below its hero as the homepage.
const spacing = (page: import("@playwright/test").Page) => page.locator("h1").first().evaluate((h) => {
  const cs = getComputedStyle(h.closest("div.relative.z-10")!);
  return [cs.paddingTop, cs.paddingBottom];
});

test("the hero spacing of every city page matches the homepage", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await closeDevNotice(page);
  const home = await spacing(page);
  await page.goto("/destinations");
  const cities = [...new Set(await page.locator('a[href^="/destinations/"]').evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!)))];
  expect(cities.length, "the Destinations page lists the cities").toBeGreaterThanOrEqual(9);
  for (const href of cities) {
    await page.goto(href);
    expect(await spacing(page), href).toEqual(home);
  }
});
