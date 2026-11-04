import { expect, test } from "@playwright/test";
import { closeDevNotice } from "./dev-notice";

test("the photo slides and intro sit between Travel Effortlessly and the services, in that order", async ({ page }) => {
  await page.goto("/");
  const position = async (selector: string) => (await page.locator(selector).boundingBox())!.y;
  const tagline = await position("section[aria-labelledby=home-tagline]");
  const showcase = await position("[data-testid=home-showcase]");
  const intro = await position("section[aria-labelledby=home-intro]");
  const services = await position("#services");
  expect(tagline).toBeLessThan(showcase);
  expect(showcase).toBeLessThan(intro);
  expect(intro).toBeLessThan(services);
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("section[aria-labelledby=home-intro] li")).toHaveCount(3);
});

test("the slides move with the arrows, loop, and link to real pages", async ({ page }) => {
  await page.goto("/");
  await closeDevNotice(page);
  const showcase = page.getByTestId("home-showcase");
  const first = showcase.getByRole("link", { name: "See airport transfers" });
  await first.scrollIntoViewIfNeeded();
  await expect(first).toBeInViewport();
  await showcase.getByRole("button", { name: "Next slide" }).click();
  const second = showcase.getByRole("link", { name: "See city-to-city rides" });
  await expect(second).toBeInViewport();
  await expect(first).not.toBeInViewport();
  await showcase.getByRole("button", { name: "Next slide" }).click();
  await showcase.getByRole("button", { name: "Next slide" }).click();
  await expect(first).toBeInViewport();
  for (const href of ["/airport-transfer", "/a-to-b-transfer", "/destinations"]) {
    const response = await page.request.get(href);
    expect(response.status(), href).toBe(200);
    await expect(showcase.locator(`a[href="${href}"]`)).toHaveCount(1);
  }
});

test("the page does not scroll sideways because of the slides", async ({ page }) => {
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
