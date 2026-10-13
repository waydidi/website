import { expect, test } from "@playwright/test";

// A staff-only page opened from outside the site (Telegram's "Open booking") without the Strict cookie:
// one hop through the site, then the sign-in page. APIs keep the plain 401. (No staff cookie is sent here.)
const html = { Accept: "text/html,application/xhtml+xml" };

test("a page link from outside the site gets the hop page; after the hop it goes to sign-in; APIs stay 401", async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  const hop = await anon.get("/admin/journeys/NOPE?x=1", { headers: { ...html, "Sec-Fetch-Site": "cross-site" }, maxRedirects: 0 });
  expect(hop.status()).toBe(200);
  expect(await hop.text()).toContain('location.replace("/admin/journeys/NOPE?x=1\\u0026__hop=1")'.replace("\\u0026", "&"));

  const after = await anon.get("/admin/journeys/NOPE?__hop=1", { headers: { ...html, "Sec-Fetch-Site": "same-origin" }, maxRedirects: 0 });
  expect(after.status()).toBe(302);
  expect(after.headers().location).toBe("/admin");

  const api = await anon.get("/api/admin/bookings", { headers: { Accept: "application/json", "Sec-Fetch-Site": "cross-site" }, maxRedirects: 0 });
  expect(api.status()).toBe(401);
  expect(await api.json()).toEqual({ error: "Staff sign-in required." });
  await anon.dispose();
});
