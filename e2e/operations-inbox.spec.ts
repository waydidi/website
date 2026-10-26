import { expect, test } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

test("operations inbox filters exceptions and preserves loaded items when refresh fails", async ({ page }) => {
  let failed = false;
  await page.route("**/api/admin/operations/inbox*", route => failed
    ? route.fulfill({ status: 503, json: { error: "Unavailable" } })
    : route.fulfill({ json: { hasMore: false, items: [
      { id: "alert:1", kind: "alert", reference: "ABCD23", severity: "critical", title: "Pickup needs attention", occurredAt: "2026-10-25T01:00:00Z", status: "open", acknowledgedBy: null },
      { id: "delivery:1", kind: "delivery", reference: "EFGH45", severity: "warning", title: "Booking notification failed", occurredAt: "2026-10-25T00:00:00Z", status: "failed", acknowledgedBy: null },
    ].filter(item => { const kind = new URL(route.request().url()).searchParams.get("kind"); return !kind || kind === "all" || item.kind === kind; }) } }));
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
  await page.route("**/api/admin/operations/inbox*", route => route.fulfill({ json: { items: [], hasMore: false } }));
  await page.goto("/admin/operations");
  await expect(page.getByRole("region", { name: "Exception inbox" }).getByText("No exceptions in this view.")).toBeVisible();
});

test("operations inbox acknowledges and resolves alerts with a note", async ({ page }) => {
  let status = "open";
  const actions: Array<Record<string, string>> = [];
  await page.route("**/api/admin/operations/inbox*", async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, string>;
      actions.push(body);
      status = body.action === "acknowledge" ? "acknowledged" : "resolved";
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({ json: { items: status === "resolved" ? [] : [{
      id: "alert:one", kind: "alert", reference: "ABCD23", severity: "warning", title: "Driver assignment needed",
      occurredAt: "2026-10-25T01:00:00Z", status, acknowledgedBy: status === "acknowledged" ? "ops@example.invalid" : null,
    }], hasMore: false } });
  });
  await page.goto("/admin/operations");
  const inbox = page.getByRole("region", { name: "Exception inbox" });
  await inbox.getByRole("button", { name: "Acknowledge", exact: true }).click();
  await expect(inbox.getByText("Acknowledged by ops@example.invalid")).toBeVisible();
  await inbox.getByRole("button", { name: "Resolve alert", exact: true }).click();
  await inbox.getByRole("textbox", { name: "Resolution note" }).fill("Driver assigned and confirmed");
  await inbox.getByRole("button", { name: "Confirm resolution" }).click();
  await expect(inbox.getByText("No exceptions in this view.")).toBeVisible();
  expect(actions).toEqual([
    { id: "one", action: "acknowledge", expectedStatus: "open", note: "" },
    { id: "one", action: "resolve", expectedStatus: "acknowledged", note: "Driver assigned and confirmed" },
  ]);
});

test("operations inbox pages through all exceptions and resets pagination when filtering", async ({ page }) => {
  const queries: string[] = [];
  await page.route("**/api/admin/operations/inbox*", async route => {
    const params = new URL(route.request().url()).searchParams;
    const offset = Number(params.get("offset") ?? 0);
    queries.push(`${params.get("kind")}:${offset}`);
    await route.fulfill({ json: { items: [{ id: "journey:" + offset, kind: "journey", reference: "ABCD23", title: "Exception " + offset, severity: "warning", status: "open", acknowledgedBy: null, occurredAt: "2026-10-25T01:00:00Z" }], hasMore: offset === 0 } });
  });
  await page.goto("/admin/operations");
  const inbox = page.getByRole("region", { name: "Exception inbox" });
  await inbox.getByRole("button", { name: "Next exceptions" }).click();
  await expect(inbox.getByText("Exception 100", { exact: true })).toBeVisible();
  await expect(inbox.getByRole("button", { name: "Next exceptions" })).toBeDisabled();
  await inbox.getByRole("combobox", { name: "Show" }).selectOption("journey");
  await expect(inbox.getByText("Exception 0", { exact: true })).toBeVisible();
  await expect(inbox.getByRole("button", { name: "Previous exceptions" })).toBeDisabled();
  expect(queries).toContain("all:100");
  expect(queries.at(-1)).toBe("journey:0");
});
