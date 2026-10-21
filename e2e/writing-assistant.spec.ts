import { expect, test } from "@playwright/test";

// Admin → Writing assistant: the owner pastes the playbook; the page loads and saves.
test.use({ storageState: "e2e/.auth/admin.json" });

test("the owner can open the Writing assistant page and save the playbook", async ({ page }) => {
  let saved: Record<string, unknown> | null = null;
  await page.route("**/api/admin/post-helper", async (route) => {
    if (route.request().method() === "POST") { saved = route.request().postDataJSON(); await route.fulfill({ json: { ok: true } }); return; }
    await route.fulfill({ json: { notes: "", whatsapp: "+66 63 206 4884", blocked: ["facebook.com"], keySet: true, maxNotes: 40000, knowledge: [{ id: "k1", topic_key: "t", question: "BKK to Pattaya options", status: "review", time_sensitive: 1, collected_at: "2026-10-21T00:00:00Z", refreshed_at: "2026-10-21T00:00:00Z", hits: 2, approved_by: "Anna", facts: 3 }] } });
  });
  await page.goto("/admin/writing-assistant");
  await expect(page.getByRole("heading", { name: "Writing assistant", level: 1 }).first()).toBeVisible();
  await expect(page.getByText("BKK to Pattaya options")).toBeVisible();
  await expect(page.getByText("Paused: check it")).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve again" })).toBeVisible();
  await expect(async () => { await page.getByRole("textbox", { name: "Playbook" }).fill("Help first. Waydidi Travel playbook."); await page.getByRole("button", { name: "Save", exact: true }).click(); await expect(page.getByText("Saved. The next /post uses it.")).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 20_000 });
  expect(saved).toMatchObject({ action: "save", notes: "Help first. Waydidi Travel playbook.", whatsapp: "+66 63 206 4884", blocked: ["facebook.com"] });
});
