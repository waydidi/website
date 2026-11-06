import { expect, test } from "@playwright/test";

// A city page is the header, the hero (photo, headline and booking form), then the sections laid out like Daytrip's
// city page, then the footer. The hero is the one the homepage booking flow draws and these sections never change it.
const cities = async (page: import("@playwright/test").Page) => {
  await page.goto("/destinations");
  const list = [...new Set(await page.locator('a[href^="/destinations/"]').evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!)))];
  expect(list.length).toBeGreaterThanOrEqual(9);
  return list;
};
const outsideHeadings = (page: import("@playwright/test").Page) => page.evaluate(() => [...document.querySelectorAll("main h2")].filter((h) => !h.closest("footer")).map((h) => (h.textContent ?? "").trim()));

test("every city page keeps its hero and footer and gets the sections, in Daytrip's order", async ({ page }) => {
  for (const href of await cities(page)) {
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1 }), href).toBeVisible();
    await expect(page.getByRole("button", { name: /choose a vehicle/i }), `${href} keeps the booking form`).toBeVisible();
    await expect(page.locator("footer").last(), `${href} keeps the footer`).toBeVisible();
    const headings = await outsideHeadings(page);
    // Sections that every city has, in order; the two route sections and the route link lists appear only for cities with routes.
    const order = [/^Popular routes from /, /^Popular routes to /, /^Why book with Waydidi$/, /^Go anywhere\. Ask us on WhatsApp\.$/, /^Explore more of Thailand$/, /^All routes to /, /^All routes from /, /^Frequently Asked Questions$/];
    const positions = order.map((pattern) => headings.findIndex((text) => pattern.test(text)));
    for (const [required, pattern] of [[true, order[2]], [true, order[3]], [true, order[4]], [true, order[7]]] as const) expect(headings.some((text) => (pattern as RegExp).test(text)), `${href}: ${pattern}`).toBe(required);
    const present = positions.filter((position) => position >= 0);
    expect(present, `${href} lists its sections in Daytrip's order`).toEqual([...present].sort((a, b) => a - b));
    expect(headings.length, `${href} has no unexpected sections`).toBe(present.length);
  }
});

test("Bangkok shows routes from and to the city, each with a time, a distance and a price or a prompt", async ({ page }) => {
  await page.goto("/destinations/bangkok");
  const from = page.locator("section", { has: page.getByRole("heading", { name: "Popular routes from Bangkok" }) });
  const to = page.locator("section", { has: page.getByRole("heading", { name: "Popular routes to Bangkok" }) });
  for (const section of [from, to]) {
    const cards = section.getByRole("link");
    expect(await cards.count()).toBeGreaterThan(2);
    for (const text of await cards.evaluateAll((links) => links.map((link) => (link as HTMLElement).innerText.replace(/\s+/g, " ").trim()))) {
      expect(text).toMatch(/ to .+\d+(h|min).*\d+ km.*(From ฿[\d,]+|Get a price)$/);
      expect(text).not.toMatch(/NaN|undefined|null/);
    }
  }
  // Every card goes to its route page when those are on, otherwise to the booking form with the route filled in.
  const hrefs = await from.getByRole("link").evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
  for (const href of hrefs) expect(href).toMatch(/^\/transfers\/[a-z-]+-to-[a-z-]+$|^\/\?rebook=again&pickup=.+&dropoff=.+#booking-search$/);
});

test("the sections come after the hero and before the footer, and the hero is untouched", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/destinations/bangkok");
  await page.waitForLoadState("networkidle");
  const geometry = await page.evaluate(() => {
    const hero = document.querySelector("h1")!.closest("section")!.getBoundingClientRect();
    const first = [...document.querySelectorAll("main h2")].find((h) => /^Popular routes from/.test(h.textContent ?? ""))!.closest("section")!.getBoundingClientRect();
    const footer = document.querySelector("footer")!.getBoundingClientRect();
    return { heroBottom: hero.bottom + scrollY, firstTop: first.top + scrollY, footerTop: footer.top + scrollY, h1: document.querySelector("h1")!.textContent };
  });
  expect(geometry.firstTop).toBeGreaterThanOrEqual(geometry.heroBottom - 1);
  expect(geometry.footerTop).toBeGreaterThan(geometry.firstTop);
  expect(geometry.h1).toBe("Bangkok private transfers & airport taxi");
});

test("Show more reveals the rest of a long route list", async ({ page }) => {
  await page.goto("/destinations/bangkok");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Popular routes from Bangkok" }) });
  const summary = section.getByText("Show more", { exact: true });
  if (await summary.count() === 0) return; // eight routes or fewer: nothing to reveal
  const before = await section.getByRole("link").count();
  await summary.click();
  expect(await section.getByRole("link").count()).toBeGreaterThanOrEqual(before);
  await expect(summary).toBeHidden();
});

test("every destination photo the cards rely on opens", async ({ request }) => {
  for (const slug of ["ayutthaya", "bangkok", "hua-hin", "kanchanaburi", "koh-chang", "koh-kood", "krabi", "pattaya", "phuket"]) {
    const response = await request.get(`/destinations/${slug}.webp`);
    expect(response.status(), slug).toBe(200);
    expect(response.headers()["content-type"], slug).toMatch(/image\//);
  }
});

test("the WhatsApp section and the other-destination cards lead somewhere real", async ({ page }) => {
  await page.goto("/destinations/bangkok");
  await expect(page.getByRole("link", { name: "Chat on WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/66632064884$/);
  const explore = page.locator("section", { has: page.getByRole("heading", { name: "Explore more of Thailand" }) });
  const hrefs = await explore.getByRole("link").evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThanOrEqual(8);
  expect(hrefs).not.toContain("/destinations/bangkok");
  for (const href of hrefs) expect(href).toMatch(/^\/destinations\/[a-z-]+$/);
});
