import { expect, test } from "@playwright/test";

// A city page is the header, the hero (photo, headline and booking form) and the footer, nothing else.
test("a city page has only the header, the hero and the footer", async ({ page }) => {
  await page.goto("/destinations");
  const cities = [...new Set(await page.locator('a[href^="/destinations/"]').evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).getAttribute("href")!)))];
  expect(cities.length).toBeGreaterThanOrEqual(9);
  for (const href of cities) {
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1 }), href).toBeVisible();
    await expect(page.getByRole("button", { name: /choose a vehicle/i }), `${href} keeps the booking form`).toBeVisible();
    await expect(page.locator("footer").last(), `${href} keeps the footer`).toBeVisible();
    // The only headings are the headline and the footer's link groups: no sections between hero and footer.
    const outside = await page.evaluate(() => [...document.querySelectorAll("main h2")].filter((h) => !h.closest("footer")).map((h) => h.textContent));
    expect(outside, `${href} has no content sections`).toEqual([]);
    // The page's own content is the footer and nothing else (the hero and header come from the booking flow).
    const content = await page.evaluate(() => [...(document.querySelector("main main") ?? document.body).children].filter((el) => el.tagName !== "SCRIPT").map((el) => el.tagName));
    expect(content, `${href} has only the footer below the hero`).toEqual(["FOOTER"]);
  }
});
