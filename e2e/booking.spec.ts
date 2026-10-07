import { expect, test } from "@playwright/test";

test("homepage search → choose a vehicle → passenger details", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle"); // let React take over the form before clicking
  await expect(page.getByRole("heading", { level: 1, name: "Your Thailand Journey Starts Here" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Pickup location" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Drop-off location" })).toBeVisible();

  await page.getByRole("button", { name: "Choose a vehicle" }).click();
  const cars = page.getByRole("listitem").getByRole("button", { name: /Total price/ });
  await expect(cars.first()).toBeVisible();
  expect(await cars.count()).toBeGreaterThan(1);
  await expect(page.getByText(/^THB [\d,]+$/).first()).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Lead passenger" })).toBeVisible();
  await page.getByRole("textbox", { name: "First name" }).fill("Test");
  await page.getByRole("textbox", { name: "Last name" }).fill("Customer");
  await page.getByRole("textbox", { name: "Email address" }).fill("test@example.com");
  await expect(page.getByRole("complementary", { name: "Your journey and cancellation terms" })).toContainText("Suvarnabhumi");
});

test("manage booking page loads", async ({ page }) => {
  const res = await page.goto("/booking/manage");
  expect(res?.status()).toBeLessThan(400);
  await expect(page.locator("main")).toBeVisible();
});
