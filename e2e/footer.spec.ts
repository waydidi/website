import { expect, test, type Page } from "@playwright/test";
import { closeDevNotice } from "./dev-notice";

// Footer links: on phones each group is a section that opens and closes; on wider screens the groups show as open columns.
// The homepage uses components/home/footer.tsx; other pages (e.g. /refund-policy) components/public-footer.tsx.
const cases: { path: string; titles: string[]; link: string; open: (page: Page) => Promise<void> }[] = [
  { path: "/", titles: ["Transfer", "Trips", "Destinations", "Help"], link: "Contact us", open: async (page) => { await page.goto("/"); await page.waitForLoadState("networkidle"); await closeDevNotice(page); } },
  { path: "/refund-policy", titles: ["Transfer", "Destinations", "Help"], link: "Contact support", open: async (page) => { await page.goto("/refund-policy"); } },
];
for (const { path, titles, link, open } of cases) test(`footer link groups on ${path}`, async ({ page, isMobile }) => {
  await open(page);
  const footer = page.locator("footer").last();
  const contact = footer.getByRole("link", { name: link, exact: true });
  if (!isMobile) { await expect(contact).toBeVisible(); await expect(footer.locator("summary").locator("visible=true")).toHaveCount(0); return; }
  for (const title of titles) await expect(footer.locator("summary", { hasText: title }).locator("visible=true")).toHaveCount(1);
  await expect(contact).toBeHidden();
  const help = footer.locator("summary", { hasText: "Help" });
  await help.click();
  await expect(contact).toBeVisible();
  await expect(contact).toHaveAttribute("href", "/contact");
  await help.click();
  await expect(contact).toBeHidden();
});
