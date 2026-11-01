import { expect, type Page } from "@playwright/test";

// The homepage opens a "We're under development" popup after it loads (see
// components/home/dev-notice.tsx). It covers the page, so homepage tests that click or use the
// keyboard close it first.
export const devNotice = (page: Page) => page.getByRole("dialog", { name: "We're under development" });

export async function closeDevNotice(page: Page) {
  const dialog = devNotice(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).last().click();
  await expect(dialog).toBeHidden();
}
