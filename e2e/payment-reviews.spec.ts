import { expect, test } from "@playwright/test";

test.use({ storageState: "e2e/.auth/admin.json" });

test("finance review claims, retries a timed-out note with the same ID, checks provider and resolves with history", async ({ page }) => {
  let row = {
    reference: "ABCD23", method: "stripe", sessionMissing: 0, reconciliationStatus: "mismatch", paymentStatus: "paid", bookingStatus: "confirmed",
    expectedMinor: 123456, receivedMinor: 123456, lastCheckedAt: null as string | null, ownerId: null as string | null, ownerName: null as string | null,
    reviewStatus: "open", version: 0, reasonsJson: '["amount","currency"]', providerMinor: 100, providerCurrency: "usd",
  };
  const events: Array<{ id: string; action: string; note: string; version: number; createdAt: string; actorName: string }> = [];
  const noteRequests: string[] = [];
  let timedOut = false;
  await page.route(/\/api\/admin\/payments$/, route => route.fulfill({ json: { rows: [], summary: { receivedMinor: 0, cashDueMinor: 0, refundedMinor: 0, driverCostsMinor: 0, disputes: 0, missingCosts: 0, profitMinor: 0, profitIncomplete: false } } }));
  await page.route("**/api/admin/payments/reviews*", async route => {
    if (route.request().method() === "GET") {
      const params = new URL(route.request().url()).searchParams;
      await route.fulfill({ json: params.has("reference") ? { events } : { items: params.get("status") === "resolved" ? row.reviewStatus === "resolved" ? [row] : [] : row.reviewStatus === "open" ? [row] : [], staffId: "finance-test", hasMore: false } });
      return;
    }
    const input = route.request().postDataJSON() as { requestId: string; action: string; note: string; expectedVersion: number };
    if (input.action === "note") noteRequests.push(input.requestId);
    if (!events.some(event => event.id === input.requestId)) {
      expect(input.expectedVersion).toBe(row.version);
      if (input.action === "resolve" && row.reconciliationStatus === "mismatch") {
        await route.fulfill({ status: 409, json: { error: "The payment discrepancy is still unresolved." } });
        return;
      }
      row = { ...row, version: row.version + 1, ownerId: "finance-test", ownerName: "Finance reviewer", reviewStatus: input.action === "resolve" ? "resolved" : "open" };
      events.unshift({ id: input.requestId, action: input.action, note: input.note, version: row.version, createdAt: "2026-10-25T01:00:00Z", actorName: "Finance reviewer" });
    }
    if (input.action === "note" && !timedOut) {
      timedOut = true;
      await route.fulfill({ status: 503, json: { error: "Response lost. Retry the same action." } });
      return;
    }
    await route.fulfill({ json: { ok: true } });
  });
  await page.route("**/api/admin/payments/reconcile", route => {
    row = { ...row, reconciliationStatus: "matched", reasonsJson: "[]", providerMinor: 123456, providerCurrency: "thb", lastCheckedAt: "2026-10-25T02:00:00Z" };
    return route.fulfill({ json: { results: [{ reference: row.reference, status: "paid" }] } });
  });
  await page.goto("/admin/financials");
  const workspace = page.getByRole("region", { name: "Payment reconciliation reviews" });
  await expect(workspace.getByText("Provider amount differs from the booking total", { exact: true })).toBeVisible();
  await expect(workspace.getByText("Provider currency is not THB", { exact: true })).toBeVisible();
  await workspace.getByRole("button", { name: "Claim review", exact: true }).click();
  await expect(workspace.getByText(/Reviewer: Finance reviewer/)).toBeVisible();
  await workspace.getByRole("button", { name: "Add note or resolve" }).click();
  await workspace.getByRole("textbox", { name: "Review note" }).fill("Investigating provider amount");
  await workspace.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(workspace.getByRole("alert")).toContainText("Response lost");
  await workspace.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(workspace.getByRole("textbox", { name: "Review note" })).toHaveCount(0);
  expect(noteRequests).toHaveLength(2);
  expect(noteRequests[0]).toBe(noteRequests[1]);
  expect(events.filter(event => event.action === "note")).toHaveLength(1);
  await workspace.getByRole("button", { name: "Add note or resolve" }).click();
  await workspace.getByRole("textbox", { name: "Review note" }).fill("Provider now agrees with the booking");
  await workspace.getByRole("button", { name: "Resolve review", exact: true }).click();
  await expect(workspace.getByRole("alert")).toContainText("still unresolved");
  await workspace.getByRole("button", { name: "Cancel", exact: true }).click();
  await workspace.getByRole("button", { name: "Check provider", exact: true }).click();
  await expect(workspace.getByText("Provider currency is not THB", { exact: true })).toHaveCount(0);
  await workspace.getByRole("button", { name: "Add note or resolve" }).click();
  await workspace.getByRole("textbox", { name: "Review note" }).fill("Provider now agrees with the booking");
  await workspace.getByRole("button", { name: "Resolve review", exact: true }).click();
  await expect(workspace.getByText("No payment reviews on this page.")).toBeVisible();
  await workspace.getByRole("combobox", { name: "Review status" }).selectOption("resolved");
  await workspace.getByRole("button", { name: "Review history", exact: true }).click();
  const history = workspace.getByRole("region", { name: "Review history for ABCD23" });
  await expect(history.getByText("Investigating provider amount", { exact: true })).toBeVisible();
  await expect(history.getByText("Provider now agrees with the booking", { exact: true })).toBeVisible();
});
