import { expect, test } from "@playwright/test";

test("measurement creates no identifiers before consent and keeps retry IDs stable through withdrawal", async ({ page }) => {
  const events: Array<Record<string, string>> = [], withdrawals: Array<{ journeyId: string }> = [];
  let lost = true;
  await page.route("**/api/funnel/config", route => route.fulfill({ json: { enabled: true } }));
  await page.route(/\/api\/funnel$/, async route => {
    if (route.request().method() === "DELETE") { withdrawals.push(route.request().postDataJSON()); await route.fulfill({ status: 204 }); return; }
    events.push(route.request().postDataJSON());
    if (lost) { lost = false; await route.abort(); } else await route.fulfill({ status: 204 });
  });
  await page.goto("/");
  const observe = (stage: string) => page.evaluate(async value => {
    // Exercise the same SDK entry point used by the booking form hook.
    const path = "/lib/booking-funnel-client.ts", sdk = await import(path);
    await sdk.observeBookingFunnelStage(value, "transfer", true);
  }, stage);
  await observe("vehicle");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect(events).toHaveLength(0);
  expect(await page.evaluate(() => sessionStorage.getItem("waydidi-funnel-v1"))).toBeNull();
  await page.context().addCookies([{ name: "waydidi_consent", value: "analytics", url: "http://localhost:5199" }]);
  await observe("vehicle");
  await expect.poll(() => events.length).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("waydidi-funnel-v1")!).journeys.transfer.events.quote.sent)).toBe(false);
  await expect.poll(async () => {
    // Focus can happen while the failed attempt is still releasing its lease.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    return events.length;
  }).toBe(2);
  expect(events[1]).toEqual(events[0]);
  expect(Object.keys(events[0]).sort()).toEqual(["eventId", "journeyId", "service", "stage"]);
  await observe("details");
  await observe("payment");
  await expect.poll(() => events.filter(value => value.stage === "payment").length).toBe(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(sessionStorage.getItem("waydidi-funnel-v1")!).journeys.transfer.events.payment.sent)).toBe(true);
  const beforeReload = events.length;
  await page.reload();
  await observe("payment");
  expect(events).toHaveLength(beforeReload);
  const journeyId = events[0].journeyId;
  await page.context().addCookies([{ name: "waydidi_consent", value: "necessary", url: "http://localhost:5199" }]);
  await page.evaluate(() => window.dispatchEvent(new Event("waydidi:consent")));
  await expect.poll(() => withdrawals.length).toBe(1);
  expect(withdrawals[0]).toEqual({ journeyId });
  await observe("payment");
  expect(events.every(value => value.journeyId === journeyId)).toBe(true);
  expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("waydidi-funnel-v1")!).journeys)).toEqual({});
});

test("disabled collection ignores analytics consent", async ({ page }) => {
  let events = 0;
  await page.context().addCookies([{ name: "waydidi_consent", value: "analytics", url: "http://localhost:5199" }]);
  await page.route("**/api/funnel/config", route => route.fulfill({ json: { enabled: false } }));
  await page.route(/\/api\/funnel$/, route => { events++; return route.fulfill({ status: 204 }); });
  await page.goto("/");
  await page.evaluate(async () => {
    const path = "/lib/booking-funnel-client.ts", sdk = await import(path);
    await sdk.observeBookingFunnelStage("vehicle", "hourly", true);
  });
  expect(events).toBe(0);
  expect(await page.evaluate(() => sessionStorage.getItem("waydidi-funnel-v1"))).toBeNull();
});

test.describe("staff aggregate funnel", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });
  test("shows observed stages, honest drop-off and missing observations with service/date filters", async ({ page }) => {
    let filter = "";
    await page.route("**/api/admin/reports/funnel*", route => {
      filter = new URL(route.request().url()).searchParams.get("service") ?? "";
      return route.fulfill({ json: { enabled: false, counts: { quote: 10, details: 6, payment: 4, confirmed: 3, incomplete: 2 } } });
    });
    await page.goto("/admin/financials");
    const report = page.getByRole("region", { name: "Booking funnel", exact: true });
    await expect(report.getByText("4 (40%)", { exact: true })).toBeVisible();
    await expect(report.getByText(/2 quoted journeys have missing/)).toBeVisible();
    await expect(report.getByText(/Collection is disabled/)).toBeVisible();
    await report.getByLabel("Service", { exact: true }).selectOption("hourly");
    await report.getByRole("button", { name: "Apply", exact: true }).click();
    await expect.poll(() => filter).toBe("hourly");
  });
});
