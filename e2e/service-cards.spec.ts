import { expect, test } from "@playwright/test";
import { closeDevNotice } from "./dev-notice";

// The service cards under the homepage hero: a white panel with rounded top corners that overlaps the hero's bottom,
// then six cards, three per row on desktop, two on tablets and one on phones. Each whole card is one link.
test.skip(({ isMobile }) => isMobile, "Sizes are set below; the phone project only repeats the desktop browser");

const CARDS: Array<[string, string]> = [
  ["City-to-city transfer", "/a-to-b-transfer"],
  ["Airport transfer", "/airport-transfer"],
  ["Hourly private driver", "/hourly-driver"],
  ["Destinations", "/destinations"],
  ["Multi-city transfer", "/long-journeys"],
  ["Airport pickup guide", "/airport-pickup-instructions"],
];

async function open(page: import("@playwright/test").Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await closeDevNotice(page);
  return page.getByRole("region", { name: "Our services" });
}

test("six cards, each one link to its page, with a short description and a Learn more button", async ({ page }) => {
  const region = await open(page, 1440, 900);
  const links = region.getByRole("link");
  await expect(links).toHaveCount(6);
  for (const [title, href] of CARDS) {
    const card = region.getByRole("link", { name: new RegExp(`^${title}`) });
    await expect(card).toHaveAttribute("href", href);
    await expect(card.getByRole("heading", { level: 2, name: title })).toBeVisible();
    await expect(card.getByText("Learn more")).toBeVisible();
  }
});

test("titles line up across a row and every Learn more button sits at the bottom of its card", async ({ page }) => {
  const region = await open(page, 1440, 900);
  const cards = await region.getByRole("link").evaluateAll(links => links.map(link => {
    const card = link.getBoundingClientRect();
    const title = link.querySelector("h2")!.getBoundingClientRect();
    const button = link.querySelector("span.mt-auto")!.getBoundingClientRect();
    return { row: Math.round(card.y), title: Math.round(title.y), fromBottom: Math.round(card.bottom - button.bottom) };
  }));
  for (const row of new Set(cards.map(card => card.row))) {
    const same = cards.filter(card => card.row === row);
    expect(new Set(same.map(card => card.title)).size, "one title height per row").toBe(1);
    expect(new Set(same.map(card => card.fromBottom)).size, "one button position per row").toBe(1);
  }
});

test("every card leads to a page that opens", async ({ request }) => {
  for (const [title, href] of CARDS) expect((await request.get(href)).status(), `${title} (${href})`).toBeLessThan(400);
});

test("the panel overlaps the bottom of the hero with rounded top corners", async ({ page }) => {
  const region = await open(page, 1440, 900);
  const geometry = await region.evaluate(panel => {
    const hero = document.querySelector("h1")!.closest("section")!.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    return { overlap: Math.round(hero.bottom - box.top), radius: getComputedStyle(panel).borderTopLeftRadius, background: getComputedStyle(panel).backgroundColor, below: box.bottom > hero.bottom };
  });
  expect(geometry.overlap).toBe(32);
  expect(geometry.radius).toBe("32px");
  expect(geometry.background).toBe("rgb(255, 255, 255)");
  expect(geometry.below).toBe(true);
});

for (const [width, height, columns] of [[1440, 900, 3], [1024, 768, 3], [768, 1024, 2], [390, 844, 1]] as const) {
  test(`${columns} card column${columns > 1 ? "s" : ""} at ${width}px, all inside the 1160px column`, async ({ page }) => {
    const region = await open(page, width, height);
    const boxes = await region.getByRole("link").evaluateAll(links => links.map(link => { const b = link.getBoundingClientRect(); return { x: Math.round(b.x), right: Math.round(b.right), w: Math.round(b.width) }; }));
    expect(new Set(boxes.map(box => box.x)).size).toBe(columns);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const left = Math.max(20, Math.round((clientWidth - 1160) / 2));
    expect(Math.min(...boxes.map(box => box.x))).toBe(left);
    expect(Math.max(...boxes.map(box => box.right))).toBe(clientWidth - left);
    // Never wider than the screen: no sideways scrolling on any size.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}
