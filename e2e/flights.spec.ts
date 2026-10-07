import { expect, test } from "@playwright/test";

test("flight status search form", async ({ page }) => {
  await page.goto("/flights");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { level: 1, name: "Flight status" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Flight no." })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("textbox", { name: /Flight number/ }).fill("TG103");
  await expect(page.getByRole("button", { name: "Check flight status" })).toBeEnabled();
  await page.getByRole("tab", { name: "Route" }).click();
  await expect(page.getByRole("tab", { name: "Route" })).toHaveAttribute("aria-selected", "true");
});
