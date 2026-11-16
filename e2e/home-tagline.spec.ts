import { expect, test } from "@playwright/test";

test("the home page has the Travel Effortlessly section below the hero and above How it works, on a soft orange background", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("section[aria-labelledby=home-tagline]");
  await expect(section.getByRole("heading", { name: "Travel Effortlessly." })).toBeVisible();
  await expect(section.getByText("Smooth journey, Your Precious memory to remember.")).toBeVisible();
  expect(await section.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 230, 204)");
  const tag = await section.boundingBox(), next = await page.locator("section[aria-labelledby=how-heading]").boundingBox();
  expect(tag!.y).toBeLessThan(next!.y);
  expect(tag!.y).toBeGreaterThan(300); // below the hero, not part of it
});

test("the six service cards are gone: the Travel Effortlessly section comes straight after the hero", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Travel Effortlessly." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Our services" })).toHaveCount(0);
  await expect(page.getByText("Ride between any two Thai cities, door to door, at a fixed price.")).toHaveCount(0);
});
