import { expect, test, type Page } from "@playwright/test";
// After the Drop the driver link goes to "กรอกข้อมูลบัญชี": bank (bottom sheet), account number, account name
// (the driver's own name), "ส่งข้อมูล", then the tick; "เสร็จสิ้น" returns to the trip page.
const trip = (over: Record<string, unknown> = {}) => ({
  evidencePolicy: { pickup_required: 0, dropoff_required: 0, gps_required: 0, gps_timeout_ms: 5000, max_accuracy_m: 2000, retention_days: 30 },
  evidenceOverrides: { pickup: false, dropoff: false },
  assignment: { id: "bank-1", currentStatus: "completed", tokenExpiresAt: "2099-01-01", passengerVerifiedAt: null, passengerVerificationMethod: null, passengerVerificationAttemptsRemaining: 5 },
  driver: { fullName: "สมชาย ใจดี", phone: "000" },
  booking: { leg: "outbound", reference: "TESTD3", customerName: "Non Naowarat", customerPhone: "000", pickup: "Bangkok", dropoff: "Pattaya", pickupDate: "2026-11-01", pickupTime: "09:00", passengers: 2, luggage: 1, vehicle: "Economy sedan", flightNumber: null, pickupLatitude: null, pickupLongitude: null, status: "confirmed" },
  events: [{ id: "ev1", status: "completed", createdAt: "2026-10-11T03:00:00Z", verificationStatus: "pending_review", hasEvidence: true }], activeStop: null, payoutDetails: null,
  noShow: { eligibleAt: null, airport: false, freeWaitMinutes: 30, maxDistanceMetres: 2000 },
  ...over,
});
async function open(page: Page, state: { saved: boolean; bankResponse?: { status: number; json: object } }) {
  const posts: Record<string, unknown>[] = [];
  await page.route("**/api/driver/trips/session", (r) => r.fulfill({ json: trip(state.saved ? { payoutDetails: { submittedAt: "2026-10-11T03:05:00Z" } } : {}) }));
  await page.route("**/api/driver/trips/session/plan", (r) => r.fulfill({ json: { days: [] } }));
  await page.route("**/api/driver/bank", (r) => {
    posts.push(JSON.parse(r.request().postData() ?? "{}"));
    const res = state.bankResponse ?? { status: 200, json: { ok: true, submittedAt: "2026-10-11T03:05:00Z" } };
    if (res.status === 200) state.saved = true;
    return r.fulfill(res);
  });
  await page.goto("/driver/trip/session");
  return posts;
}
const chooseBank = async (page: Page, name: RegExp | string) => {
  await page.getByRole("button", { name: /ธนาคาร/ }).first().click();
  const sheet = page.getByRole("dialog", { name: "เลือกธนาคาร" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name }).click();
  await expect(sheet).toHaveCount(0);
};

test("after the Drop the link opens กรอกข้อมูลบัญชี with the driver's own name filled in", async ({ page }) => {
  await open(page, { saved: false });
  await expect(page.getByRole("heading", { name: "กรอกข้อมูลบัญชี" })).toBeVisible({ timeout: 30000 });
  await expect(page.getByLabel("ชื่อบัญชี")).toHaveValue("สมชาย ใจดี");
  await expect(page.getByText("ต้องตรงกับชื่อคนขับ:")).toContainText("สมชาย ใจดี");
  await expect(page.getByRole("button", { name: "ส่งข้อมูล" })).toBeVisible();
  await expect(page.getByText("ชื่อลูกค้า")).toHaveCount(0); // the trip page waits until the details are in
});

test("the bank is chosen in a bottom sheet; sending shows the tick and the details were posted with the link's token", async ({ page }) => {
  const posts = await open(page, { saved: false });
  await expect(page.getByRole("heading", { name: "กรอกข้อมูลบัญชี" })).toBeVisible({ timeout: 30000 });
  await chooseBank(page, /ธนาคารกสิกรไทย/);
  await expect(page.getByRole("button", { name: /ธนาคารกสิกรไทย/ })).toBeVisible();
  await page.getByLabel("เลขที่บัญชี").fill("123-4-56789-0"); // only digits are kept
  await expect(page.getByLabel("เลขที่บัญชี")).toHaveValue("1234567890");
  await page.getByRole("button", { name: "ส่งข้อมูล" }).click();
  await expect(page.getByRole("heading", { name: "ส่งข้อมูลเรียบร้อย" })).toBeVisible();
  expect(posts).toEqual([{ token: "session", bankCode: "KBANK", accountNumber: "1234567890", accountName: "สมชาย ใจดี" }]);
  await expect(page.getByText("xxxxxx7890")).toBeVisible(); // the number is shown partly hidden
  await expect(page.getByText("ธนาคารกสิกรไทย").first()).toBeVisible();
  // "เสร็จสิ้น" goes back to the trip page, which now stays (the details are in).
  await page.getByRole("button", { name: "เสร็จสิ้น" }).click();
  await expect(page.getByText("ชื่อลูกค้า")).toBeVisible();
  await expect(page.getByRole("heading", { name: "กรอกข้อมูลบัญชี" })).toHaveCount(0);
});

test("mistakes are explained before sending: no bank, a short number, another person's name", async ({ page }) => {
  const posts = await open(page, { saved: false });
  await expect(page.getByRole("heading", { name: "กรอกข้อมูลบัญชี" })).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "ส่งข้อมูล" }).click();
  await expect(page.getByText("กรุณาเลือกธนาคาร")).toBeVisible();
  await chooseBank(page, /ธนาคารไทยพาณิชย์/);
  await page.getByLabel("เลขที่บัญชี").fill("12345");
  await page.getByRole("button", { name: "ส่งข้อมูล" }).click();
  await expect(page.getByText("เลขที่บัญชีไม่ถูกต้อง")).toBeVisible();
  await page.getByLabel("เลขที่บัญชี").fill("1234567890");
  await page.getByLabel("ชื่อบัญชี").fill("ใครสักคน ใจดี");
  await page.getByRole("button", { name: "ส่งข้อมูล" }).click();
  await expect(page.getByText("ชื่อบัญชีต้องตรงกับชื่อคนขับ (สมชาย ใจดี)")).toBeVisible();
  expect(posts).toHaveLength(0);
});

test("a refusal from the server is shown and the form stays", async ({ page }) => {
  await open(page, { saved: false, bankResponse: { status: 400, json: { error: "ชื่อบัญชีต้องตรงกับชื่อคนขับ (สมชาย ใจดี)", field: "name" } } });
  await expect(page.getByRole("heading", { name: "กรอกข้อมูลบัญชี" })).toBeVisible({ timeout: 30000 });
  await chooseBank(page, /ธนาคารกรุงเทพ/);
  await page.getByLabel("เลขที่บัญชี").fill("1234567890");
  await page.getByRole("button", { name: "ส่งข้อมูล" }).click();
  await expect(page.getByText("ชื่อบัญชีต้องตรงกับชื่อคนขับ (สมชาย ใจดี)").last()).toBeVisible();
  await expect(page.getByRole("heading", { name: "ส่งข้อมูลเรียบร้อย" })).toHaveCount(0);
});

test("from the tick the driver can edit the details", async ({ page }) => {
  await open(page, { saved: false });
  await expect(page.getByRole("heading", { name: "กรอกข้อมูลบัญชี" })).toBeVisible({ timeout: 30000 });
  await chooseBank(page, /ธนาคารกรุงไทย/);
  await page.getByLabel("เลขที่บัญชี").fill("9876543210");
  await page.getByRole("button", { name: "ส่งข้อมูล" }).click();
  await expect(page.getByRole("heading", { name: "ส่งข้อมูลเรียบร้อย" })).toBeVisible();
  await page.getByRole("button", { name: "แก้ไขข้อมูลบัญชี" }).click();
  await expect(page.getByRole("heading", { name: "กรอกข้อมูลบัญชี" })).toBeVisible();
  await expect(page.getByLabel("เลขที่บัญชี")).toHaveValue("9876543210");
});

test("a driver who already sent the details goes straight to the trip page", async ({ page }) => {
  await open(page, { saved: true });
  await expect(page.getByText("ชื่อลูกค้า")).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("heading", { name: "กรอกข้อมูลบัญชี" })).toHaveCount(0);
});
test("a cash job skips กรอกข้อมูลบัญชี and shows the completed trip page as before", async ({ page }) => {
  await page.route("**/api/driver/trips/session", (r) => r.fulfill({ json: trip({ payoutNeeded: false }) }));
  await page.route("**/api/driver/trips/session/plan", (r) => r.fulfill({ json: { days: [] } }));
  await page.goto("/driver/trip/session");
  await expect(page.getByText("ชื่อลูกค้า")).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("heading", { name: "กรอกข้อมูลบัญชี" })).toHaveCount(0);
});
