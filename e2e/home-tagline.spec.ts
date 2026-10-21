import { expect, test } from "@playwright/test";

test("the home page has the Travel Effortlessly section below the hero and above the services, on a soft orange background", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("section[aria-labelledby=home-tagline]");
  await expect(section.getByRole("heading", { name: "Travel Effortlessly." })).toBeVisible();
  await expect(section.getByText("Smooth journey, Your Precious memory to remember.")).toBeVisible();
  expect(await section.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(255, 230, 204)");
  const tag = await section.boundingBox(), services = await page.locator("#services").boundingBox();
  expect(tag!.y).toBeLessThan(services!.y);
  expect(tag!.y).toBeGreaterThan(300); // below the hero, not part of it
});
