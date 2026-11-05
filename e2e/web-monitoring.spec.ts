import { expect, test } from "@playwright/test";

type Sent = { events: Array<Record<string, unknown>> };

test("a visitor's browser reports speed and errors only after consent, without the error's message", async ({ page }) => {
  const batches: Sent[] = [];
  await page.route("**/api/web-monitoring", async route => { batches.push(route.request().postDataJSON()); await route.fulfill({ status: 204 }); });
  await page.goto("/");
  const start = () => page.evaluate(async () => {
    // The layout mounts this only when WEB_MONITORING_ENABLED=1, so the test calls the same entry point.
    const path = "/components/web-monitoring.tsx", sdk = await import(path);
    await sdk.startWebMonitoring();
  });
  const fail = () => page.evaluate(() => { setTimeout(() => { throw new TypeError("customer@example.invalid WD-SECRET"); }, 0); });

  await start();
  await fail();
  await page.waitForTimeout(6000);
  expect(batches).toHaveLength(0);

  await page.context().addCookies([{ name: "waydidi_consent", value: "analytics", url: "http://localhost:5199" }]);
  await start();
  await fail();
  await expect.poll(() => batches.flatMap(batch => batch.events).some(event => event.kind === "error"), { timeout: 15000 }).toBe(true);
  await expect.poll(() => batches.flatMap(batch => batch.events).some(event => event.kind === "vital" && event.name === "TTFB"), { timeout: 15000 }).toBe(true);

  const events = batches.flatMap(batch => batch.events);
  const error = events.find(event => event.kind === "error")!;
  expect(error.errorType).toBe("TypeError");
  expect(error.route).toBe("/");
  expect(Object.keys(error).sort()).toEqual(["column", "device", "errorType", "file", "kind", "line", "route"]);
  const sent = JSON.stringify(batches);
  expect(sent).not.toContain("customer@example.invalid");
  expect(sent).not.toContain("WD-SECRET");
  for (const event of events.filter(item => item.kind === "vital")) expect(Number.isInteger(event.value)).toBe(true);
});

test("the monitoring endpoint stays silent while it is switched off", async ({ request }) => {
  const response = await request.post("/api/web-monitoring", { data: { events: [{ kind: "vital", route: "/", name: "LCP", value: 1000, device: "desktop", connection: "4g" }] }, headers: { cookie: "waydidi_consent=analytics" } });
  expect(response.status()).toBe(204);
});
