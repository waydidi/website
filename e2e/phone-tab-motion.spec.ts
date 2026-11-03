import { expect, test } from "@playwright/test";
import { signInStaff } from "./staff-session";

// Phone bottom bar motion (transitions.dev): the pill slides to the tapped tab, Chat carries an
// unread badge, and a tab the staff role can't open shakes with a note instead of opening.
test.skip(({ isMobile }) => !isMobile, "The bottom menu is the phone layout");

const pillBox = (page: import("@playwright/test").Page) => page.locator(".t-tabs-pill").evaluate((el) => {
  const r = el.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), opacity: getComputedStyle(el).opacity };
});
const box = async (loc: import("@playwright/test").Locator) => { const b = (await loc.boundingBox())!; return { x: Math.round(b.x), w: Math.round(b.width) }; };

test.describe("owner", () => {
  test.use({ storageState: "e2e/.auth/admin.json" });
  test("the pill sits under Overview, then slides under Bookings", async ({ page }) => {
    await page.goto("/admin");
    const nav = page.getByRole("navigation", { name: "Mobile admin sections" });
    const overview = nav.getByRole("link", { name: "Overview" }), bookings = nav.getByRole("link", { name: "Bookings" });
    await expect.poll(async () => (await pillBox(page)).x).toBe((await box(overview)).x);
    await bookings.click();
    await expect(page).toHaveURL(/\/admin\/bookings$/);
    await expect.poll(async () => { const p = await pillBox(page); return [p.x, p.w, p.opacity]; }).toEqual([(await box(bookings)).x, (await box(bookings)).w, "1"]);
    // Chat's badge is in the bar and closed while nothing is unread.
    await expect(nav.locator(".t-badge")).toHaveAttribute("data-open", "false");
  });

  test("Chat's unread count pops in as a badge", async ({ page }) => {
    // Three customer messages waiting (the bar checks /api/admin/chat?summary=1).
    await page.route("**/api/admin/chat?summary=1", (route) => route.fulfill({ json: { items: [{ key: "chat:e2e", n: 3, text: "", href: "/admin/chat", urgent: true }] } }));
    await page.goto("/admin");
    const chat = page.getByRole("navigation", { name: "Mobile admin sections" }).getByRole("link", { name: /Chat/ });
    await expect(chat.locator(".t-badge")).toHaveAttribute("data-open", "true");
    await expect(chat.locator(".t-badge-dot")).toHaveText("3");
    await expect(chat).toContainText("3 unread");
  });
});

test("finance staff: Bookings shakes with a note and does not open", async ({ page, baseURL }) => {
  await signInStaff(page.context(), baseURL!, "finance");
  await page.goto("/admin/profile");
  await page.waitForLoadState("networkidle");
  // Tap only once the bar is interactive (before that, a tap is a plain link and the Worker refuses it).
  await expect.poll(() => page.locator('[data-tab="/admin/bookings"]').evaluate((el) => Object.keys(el).some((k) => k.startsWith("__react")))).toBe(true);
  const nav = page.getByRole("navigation", { name: "Mobile admin sections" });
  const bookings = nav.getByRole("link", { name: "Bookings" });
  await bookings.click();
  await expect(nav.getByText("Your staff role can't open Bookings")).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/profile$/);
  await expect(nav.locator(".t-error-msg")).toHaveCSS("visibility", "visible");
  // The note fades away after the hold.
  await expect(nav.locator(".t-error-msg")).toHaveCSS("visibility", "hidden", { timeout: 6000 });
});
