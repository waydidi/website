import { expect, test } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

test("operations inbox filters exceptions and preserves loaded items when refresh fails", async ({ page }) => {
  let failed = false;
  await page.route("**/api/admin/operations/inbox", route => failed
    ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
    : route.fulfill({ json: { hasMore: false, items: [
      { id: "alert:1", kind: "alert", reference: "ABCD23", severity: "critical", title: "Pickup needs attention", occurredAt: "2026-10-25T01:00:00Z" },
      { id: "delivery:1", kind: "delivery", reference: "EFGH45", severity: "warning", title: "Booking notification failed", occurredAt: "2026-10-25T00:00:00Z" },
    ] } }));
  await page.goto("/admin/operations");
  const inbox = page.getByRole("region", { name: "Exception inbox" });
  await expect(inbox.getByText("Pickup needs attention", { exact: true })).toBeVisible();
  await inbox.getByRole("combobox", { name: "Show" }).selectOption("delivery");
  await expect(inbox.getByText("Pickup needs attention", { exact: true })).toHaveCount(0);
  await expect(inbox.getByRole("link", { name: "Review Booking notification failed for EFGH45" })).toHaveAttribute("href", "/admin/journeys/EFGH45");
  failed = true;
  await inbox.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(inbox.getByRole("alert")).toContainText("Previously loaded items");
  await expect(inbox.getByText("Booking notification failed", { exact: true })).toBeVisible();
  failed = false;
  await inbox.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(inbox.getByRole("alert")).toHaveCount(0);
});

test("operations inbox shows an empty state", async ({ page }) => {
  await page.route("**/api/admin/operations/inbox", route => route.fulfill({ json: { items: [], hasMore: false } }));
  await page.goto("/admin/operations");
  await expect(page.getByRole("region", { name: "Exception inbox" }).getByText("No exceptions in this view.")).toBeVisible();
});
