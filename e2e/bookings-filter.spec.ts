import { readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";

// Phone: the Filter button sits in the same row as the View picker and narrows the booking cards.
test.use({ storageState: "e2e/.auth/admin.json" });
test.skip(({ isMobile }) => !isMobile, "The Filter button is on the phone layout");

const D1_DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const localDatabases = () => readdirSync(D1_DIR).filter((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite").map((f) => `${D1_DIR}/${f}`)
  .filter((path) => { const db = new DatabaseSync(path, { readOnly: true }); try { return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='bookings'").get(); } finally { db.close(); } });

const ids = ["FLT001", "FLT002", "FLT003"];
test.beforeAll(() => {
  const at = new Date().toISOString();
  for (const path of localDatabases()) {
    const db = new DatabaseSync(path);
    try {
      for (const [ref, date, method, pay] of [["FLT001", "2099-05-01", "card", "paid"], ["FLT002", "2099-05-02", "cash", "cash_due"]]) {
        db.prepare(`INSERT OR REPLACE INTO bookings(reference,customer_name,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,passengers,luggage,vehicle,payment_method,payment_status,total,status,created_at,access_token_hash,updated_at)
          VALUES(?,?,'f@example.invalid','0800000000','Airport','Hotel',?,'09:00',2,1,'economy_sedan',?,?,1800,'confirmed',?,?,?)`).run(ref, ref === "FLT001" ? "Paid Customer" : "Cash Customer", date, method, pay, at, `hash-${ref}`, at);
      }
      // A round trip whose first trip is already done (2099 pickup, so the Date filters do not matter).
      db.prepare(`INSERT OR REPLACE INTO bookings(reference,customer_name,customer_email,customer_phone,pickup,dropoff,pickup_date,pickup_time,return_date,return_time,passengers,luggage,vehicle,payment_method,payment_status,total,status,created_at,access_token_hash,updated_at)
        VALUES('FLT003','Round Customer','f@example.invalid','0800000000','Trat Airport','Koh Chang','2099-05-03','09:00','2099-05-09','10:00',2,1,'economy_sedan','cash','cash_due',2500,'confirmed',?,'hash-FLT003',?)`).run(at, at);
      db.prepare("DELETE FROM journey_legs WHERE booking_reference='FLT003'").run();
      db.prepare("INSERT INTO journey_legs(id,booking_reference,leg,status,created_at,updated_at) VALUES('FLT003:outbound','FLT003','outbound','completed',?,?)").run(at, at);
      try { db.prepare("DELETE FROM booking_leg_prices WHERE booking_reference='FLT003'").run(); } catch { /* the table is made on first use */ }
    } finally { db.close(); }
  }
});
test.afterAll(() => {
  for (const path of localDatabases()) { const db = new DatabaseSync(path); try { for (const id of ids) { db.prepare("DELETE FROM bookings WHERE reference=?").run(id); db.prepare("DELETE FROM journey_legs WHERE booking_reference=?").run(id); try { db.prepare("DELETE FROM booking_leg_prices WHERE booking_reference=?").run(id); } catch { /* none */ } } } finally { db.close(); } }
});

test("Filter is next to View, narrows the cards, and Clear all shows everything again", async ({ page }) => {
  await page.goto("/admin/bookings");
  await page.waitForLoadState("networkidle");
  const filter = page.getByRole("button", { name: "Filter", exact: true });
  const view = page.getByRole("button", { name: /^View:/ });
  await expect(filter).toBeVisible();
  const [a, b] = [await filter.boundingBox(), await view.boundingBox()];
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(6); // the same row
  expect(a!.x).toBeLessThan(b!.x); // on the left of View
  const cards = page.getByRole("list", { name: "Transfer bookings" }).getByRole("listitem");
  await expect(cards.filter({ hasText: "FLT001" })).toHaveCount(1);
  await expect(cards.filter({ hasText: "FLT002" })).toHaveCount(1);

  await filter.click();
  const sheet = page.getByRole("dialog", { name: "Filter bookings" });
  await sheet.getByRole("button", { name: "Collect cash" }).click();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Filter, 1 active" })).toBeVisible();
  await expect(cards.filter({ hasText: "FLT002" })).toHaveCount(1);
  await expect(cards.filter({ hasText: "FLT001" })).toHaveCount(0);

  await page.reload(); // remembered for this tab
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("button", { name: "Filter, 1 active" })).toBeVisible();
  await expect(cards.filter({ hasText: "FLT001" })).toHaveCount(0);

  await page.getByRole("button", { name: "Filter, 1 active" }).click();
  await page.getByRole("dialog", { name: "Filter bookings" }).getByRole("button", { name: "Clear all" }).click();
  await page.getByRole("dialog", { name: "Filter bookings" }).getByRole("button", { name: "Done" }).click();
  await expect(cards.filter({ hasText: "FLT001" })).toHaveCount(1);
  await expect(cards.filter({ hasText: "FLT002" })).toHaveCount(1);
});

test("a round trip: Completed lists the finished first trip while the second is still to come, and Price splits the payment in two", async ({ page }) => {
  await page.goto("/admin/bookings");
  await page.waitForLoadState("networkidle");
  const cards = page.getByRole("list", { name: "Transfer bookings" }).getByRole("listitem").filter({ hasText: "FLT003" });
  // Normally one card for the booking: the trip that is still to come.
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Second trip");

  await page.getByRole("button", { name: "Filter", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Filter bookings" });
  await sheet.getByRole("button", { name: "Completed" }).click();
  await sheet.getByRole("button", { name: "Done" }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("First trip"); // the finished first trip, not the second
  await page.getByRole("button", { name: /Filter, 1 active/ }).click();
  await page.getByRole("dialog", { name: "Filter bookings" }).getByRole("button", { name: "Clear all" }).click();
  await page.getByRole("dialog", { name: "Filter bookings" }).getByRole("button", { name: "Done" }).click();

  // Price → pop-up from the bottom with the two prices.
  await cards.first().getByRole("button", { name: "See details" }).click();
  await cards.first().getByRole("button", { name: "Split the price into two payments" }).click();
  const split = page.getByRole("dialog", { name: /Split payment/ });
  await expect(split.getByText("First trip price to collect")).toBeVisible();
  await expect(split.getByText("Second trip price to collect")).toBeVisible();
  const save = split.getByRole("button", { name: "Save" });
  await split.getByLabel("First trip price to collect").fill("1500");
  await expect(split.getByLabel("Second trip price to collect")).toHaveValue("1000"); // the rest, until typed by hand
  await split.getByLabel("Second trip price to collect").fill("900");
  await expect(save).toBeDisabled(); // does not add up to THB 2,500
  await split.getByLabel("Second trip price to collect").fill("1000");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(split).toBeHidden();
  // The second trip now shows its part; the first trip (under Completed) shows its own.
  await expect(cards.first().getByText("THB 1,000")).toBeVisible();
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("dialog", { name: "Filter bookings" }).getByRole("button", { name: "Completed" }).click();
  await page.getByRole("dialog", { name: "Filter bookings" }).getByRole("button", { name: "Done" }).click();
  await cards.first().getByRole("button", { name: "See details" }).click();
  await expect(cards.first().getByText("THB 1,500")).toBeVisible();
});
