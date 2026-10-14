import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";

// The booking cards row scrolls sideways with a mouse too (desktop and tablet-sized windows): Previous / Next
// buttons and dragging. On a touch phone the row is swiped and the buttons stay hidden.
test.use({ storageState: "e2e/.auth/admin.json" });

const D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const localDatabases = () => readdirSync(D1_DIR).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite").map((f) => `${D1_DIR}/${f}`)
  .filter((path) => { const db = new DatabaseSync(path, { readOnly: true }); try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='bookings'").get(); } finally { db.close(); } });
const ids = ["SCR001", "SCR002", "SCR003", "SCR004"];
test.beforeAll(() => {
  const at = new Date().toISOString();
  for (const path of localDatabases()) {
    const db = new DatabaseSync(path);
    try {
      ids.forEach((ref, n) => db.prepare(`INSERT OR REPLACE INTO bookings(reference,customer_name,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,payment_status,total,status,created_at,access_token_hash,updated_at)
        VALUES(?,?,'s@example.invalid','0800000000','Airport','Hotel',?,'09:00',2,1,'economy_sedan','cash','cash_due',1800,'confirmed',?,?,?)`).run(ref, `Scroll Customer ${n}`, `2099-06-0${n + 1}`, at, `hash-${ref}`, at));
    } finally { db.close(); }
  }
});
test.afterAll(() => { for (const path of localDatabases()) { const db = new DatabaseSync(path); try { for (const id of ids) db.prepare("DELETE FROM bookings WHERE reference=?").run(id); } finally { db.close(); } } });

test("with a mouse the cards row has Next / Previous buttons and can be dragged", async ({ page, isMobile }) => {
  test.skip(isMobile, "Touch phones swipe; the buttons are for a mouse");
  await page.setViewportSize({ width: 480, height: 900 }); // a narrow window: the card layout, no touch
  await page.goto("/admin/bookings");
  await page.waitForLoadState("networkidle");
  const row = page.getByRole("list", { name: "Transfer bookings" });
  const next = page.getByRole("button", { name: "Next bookings" }).first(), previous = page.getByRole("button", { name: "Previous bookings" }).first();
  await expect(row.getByRole("listitem").first()).toBeVisible();
  await expect(next).toBeVisible();
  await expect(previous).toBeDisabled(); // at the start
  const left = () => row.evaluate((el) => el.scrollLeft);
  expect(await left()).toBe(0);
  await next.click();
  await expect.poll(left).toBeGreaterThan(100);
  await expect(previous).toBeEnabled();
  await previous.click();
  await expect.poll(left).toBeLessThan(5);
  // Dragging the row with the mouse.
  const box = (await row.getByRole("listitem").first().boundingBox())!;
  await page.mouse.move(box.x + box.width - 30, box.y + 70); // on the card's text, not on a button or link
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 70, { steps: 8 });
  await page.mouse.up();
  await expect.poll(left).toBeGreaterThan(100);
});

test("on a touch phone the row is swiped: no buttons", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phone project only");
  await page.goto("/admin/bookings");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("list", { name: "Transfer bookings" }).getByRole("listitem").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Next bookings" }).first()).toBeHidden();
});
