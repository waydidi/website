import { expect, test } from "@playwright/test";
import { signInStaff } from "./staff-session";

// Phone: tapping Bookings in the bottom menu opens the bookings page for staff who are not the owner.
// The tap loads the page's data from /admin/bookings.rsc; the Worker's role check used to refuse that
// address (403), so the menu looked stuck on Overview until a full reload.
test.skip(({ isMobile }) => !isMobile, "The bottom menu is the phone layout");

test("operations staff: the Bookings tab opens the bookings page in-app", async ({ page, baseURL }) => {
  await signInStaff(page.context(), baseURL!, "operations");
  const refused: string[] = [];
  page.on("response", (r) => { if (r.url().includes(".rsc") && r.status() >= 400) refused.push(`${r.status()} ${r.url()}`); });
  await page.goto("/admin");
  await page.waitForLoadState("networkidle");
  const nav = page.getByRole("navigation", { name: "Mobile admin sections" });
  await nav.getByRole("link", { name: "Bookings" }).click();
  await expect(page).toHaveURL(/\/admin\/bookings$/);
  await expect(nav.getByRole("link", { name: "Bookings" })).toHaveAttribute("aria-current", "page");
  await page.waitForLoadState("networkidle");
  expect(refused).toEqual([]);
});
