import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// The extension popup's reply queue (extensions/fb-leads/popup.html + popup.js + queue-plan.js) with a stubbed
// `chrome`: the group list from the website, ticking and ordering groups, the always-on box, the running view and Start.
const DIR = path.join(process.cwd(), "extensions", "fb-leads");
const PAGE = "https://popup.test/popup.html";
const html = readFileSync(path.join(DIR, "popup.html"), "utf8").replace(/<script src="[^"]+"><\/script>/g, "");

type Store = Record<string, unknown>;
async function open(page: Page, store: Store, groups: { key: string; name: string; waiting: number }[]) {
  await page.route(PAGE, (route) => route.fulfill({ contentType: "text/html", body: html }));
  await page.addInitScript(({ store, groups }) => {
    const data: Record<string, unknown> = JSON.parse(JSON.stringify(store));
    const listeners: ((c: unknown) => void)[] = [];
    const w = window as unknown as { sent: unknown[]; data: typeof data; chrome: unknown };
    w.sent = []; w.data = data;
    w.chrome = {
      runtime: {
        lastError: undefined,
        sendMessage: (m: { type: string }, cb?: (r: unknown) => void) => { w.sent.push(m); if (cb) setTimeout(() => cb(m.type === "reply-groups" ? { ok: true, groups } : { ok: true })); },
        openOptionsPage: () => undefined,
      },
      storage: {
        local: {
          get: (defaults: Record<string, unknown>, cb: (s: Record<string, unknown>) => void) => { const out: Record<string, unknown> = {}; for (const k of Object.keys(defaults)) out[k] = k in data ? data[k] : defaults[k]; setTimeout(() => cb(JSON.parse(JSON.stringify(out)))); },
          set: (v: Record<string, unknown>, cb?: () => void) => { Object.assign(data, JSON.parse(JSON.stringify(v))); setTimeout(() => { listeners.forEach((l) => l(v)); if (cb) cb(); }); },
        },
        onChanged: { addListener: (l: (c: unknown) => void) => listeners.push(l) },
      },
      tabs: { query: () => undefined },
    };
  }, { store, groups });
  await page.goto(PAGE);
  for (const f of ["queue-plan.js", "popup.js"]) await page.addScriptTag({ path: path.join(DIR, f) });
}
const rows = (page: Page) => page.locator("#groups .g");
const saved = (page: Page) => page.evaluate(() => (window as unknown as { data: { replyGroups?: { groups: { key: string; on: boolean }[]; per: number } } }).data.replyGroups);

test("lists the website's groups with their counts; no Like or Send-from-Telegram boxes, an Always on note instead", async ({ page }) => {
  await open(page, {}, [{ key: "khaolak", name: "Khao Lak Community", waiting: 14 }, { key: "kata", name: "Katathani Phuket Resort group", waiting: 8 }]);
  await expect(rows(page)).toHaveCount(2);
  await expect(rows(page).nth(0)).toContainText("Khao Lak Community");
  await expect(rows(page).nth(0)).toContainText("14 waiting");
  await expect(page.locator("#likeFirst, #autoPost")).toHaveCount(0);
  await expect(page.locator(".always")).toContainText("Likes the post first");
  await expect(page.locator(".always")).toContainText("ส่ง Comment");
  await expect(page.locator("#per")).toHaveValue("10");
});

test("the arrows change the order and untick leaves a group out; both are saved at once", async ({ page }) => {
  await open(page, {}, [{ key: "khaolak", name: "Khao Lak Community", waiting: 14 }, { key: "kata", name: "Katathani", waiting: 8 }, { key: "pattaya", name: "Pattaya Expats", waiting: 5 }]);
  await rows(page).nth(1).locator("button", { hasText: "▲" }).click();
  await expect(rows(page).nth(0)).toContainText("Katathani");
  await rows(page).nth(2).locator("input").uncheck();
  await expect(rows(page).nth(2)).toContainText("not in this run");
  expect(await saved(page)).toEqual({ groups: [{ key: "kata", name: "Katathani", on: true }, { key: "khaolak", name: "Khao Lak Community", on: true }, { key: "pattaya", name: "Pattaya Expats", on: false }], per: 10 });
  await page.locator("#per").fill("99"); await page.locator("#per").blur();
  await expect(page.locator("#per")).toHaveValue("50");
  expect((await saved(page))?.per).toBe(50);
});

test("Start saves the list before asking the queue to start; with nothing ticked it does not start", async ({ page }) => {
  await open(page, {}, [{ key: "khaolak", name: "Khao Lak Community", waiting: 14 }]);
  await rows(page).nth(0).locator("input").uncheck();
  await page.locator("#replyStart").click();
  await expect(page.locator("#reply")).toContainText("Tick at least one group first.");
  expect(await page.evaluate(() => (window as unknown as { sent: { type: string }[] }).sent.some((m) => m.type === "reply-start"))).toBe(false);
  await rows(page).nth(0).locator("input").check();
  await page.locator("#replyStart").click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { sent: { type: string }[] }).sent.some((m) => m.type === "reply-start"))).toBe(true);
  expect((await saved(page))?.groups[0].on).toBe(true);
});

test("while running: the current group says Now with its count, the next says Next, nothing can be changed", async ({ page }) => {
  const groups = [{ key: "khaolak", name: "Khao Lak Community", on: true }, { key: "kata", name: "Katathani", on: true }];
  const plan = { groups: groups.map(({ key, name }) => ({ key, name })), per: 10, at: 0, count: 3, round: 1, sig: "khaolak|kata#10" };
  await open(page, { replyGroups: { groups, per: 10 }, replyRun: { active: true, plan, message: "Round 1 · Khao Lak Community 3 of 10. Next comment at 14:32." } }, [{ key: "khaolak", name: "Khao Lak Community", waiting: 11 }, { key: "kata", name: "Katathani", waiting: 8 }]);
  await expect(rows(page).nth(0)).toContainText("Now · 3 of 10 posted");
  await expect(rows(page).nth(1)).toContainText("Next · 8 waiting");
  await expect(page.locator("#groups button")).toHaveCount(0);
  await expect(page.locator("#groups input:not([disabled])")).toHaveCount(0);
  await expect(page.locator("#per")).toBeDisabled();
  await expect(page.locator("#replyStop")).toBeVisible();
});
