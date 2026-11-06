import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

// The Collect button's scroller (extensions/fb-leads/runner.js). The page, the clock, the pauses and the scanner are
// faked so the run is instant; the scroll calls and pauses it asks for are recorded and checked. Nothing here
// touches Facebook.
const RUNNER = path.join(process.cwd(), "extensions", "fb-leads", "runner.js");

type Opts = { scan?: "posts" | "idle" | "fail"; leadsPerStep?: number; rng?: number[] | number; maxMs?: number; clockStepMs?: number; hide?: number; touchAt?: number; leaveAt?: number; abortAt?: number; maxLeads?: number; maxPosts?: number };
type Out = { result: { reason: string; posts: number; leads: number; steps: number }; scrolls: number[]; sleeps: number[]; clicks: number; height: number };

async function run(page: Page, opts: Opts = {}): Promise<Out> {
  await page.route("https://www.facebook.com/groups/test/", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>t</title><div style='height:40000px'>feed</div>" }));
  await page.goto("https://www.facebook.com/groups/test/");
  await page.addScriptTag({ path: RUNNER });
  return page.evaluate(async (o: Opts) => {
    const w = window as unknown as { WaydidiLeads: { collect: (x: Record<string, unknown>) => Promise<Out["result"]> } };
    const scrolls: number[] = [], sleeps: number[] = [];
    let clicks = 0, calls = 0, clock = 0, n = 0;
    document.addEventListener("click", () => clicks++, true);
    window.scrollBy = ((arg: ScrollToOptions) => { scrolls.push(arg.top as number); }) as typeof window.scrollBy;
    if (o.hide !== undefined) Object.defineProperty(document, "hidden", { configurable: true, get: () => calls >= (o.hide as number) });
    const seq = Array.isArray(o.rng) ? o.rng : null;
    const rng = () => (seq ? seq[n++ % seq.length] : typeof o.rng === "number" ? o.rng : (n++ * 0.37 + 0.11) % 1);
    const abort = new AbortController();
    const result = await w.WaydidiLeads.collect({
      win: window, rng, signal: abort.signal, maxMs: o.maxMs, maxLeads: o.maxLeads, maxPosts: o.maxPosts,
      now: () => clock,
      sleep: async (ms: number) => {
        sleeps.push(ms); clock += o.clockStepMs ?? ms;
        if (o.touchAt === calls) document.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
        if (o.abortAt === calls) abort.abort();
      },
      scan: async () => {
        calls++;
        if (o.leaveAt === calls) history.pushState({}, "", "/marketplace/");
        if (o.scan === "fail") return null;
        if (o.scan === "idle") return { posts: 0, leads: 0 };
        return { posts: 4, leads: o.leadsPerStep ?? 1 };
      },
    });
    return { result, scrolls, sleeps, clicks, height: window.innerHeight };
  }, opts);
}

test("reads like a person: uneven distances, pauses of different lengths within human range, never clicks", async ({ page }) => {
  const out = await run(page, { leadsPerStep: 1, maxLeads: 25, maxPosts: 1000 });
  expect(out.result.reason).toBe("enough");
  expect(out.scrolls.length).toBeGreaterThan(10);
  const down = out.scrolls.filter((d) => d > 0);
  expect(new Set(out.scrolls).size).toBeGreaterThan(out.scrolls.length * 0.8); // no repeating rhythm
  expect(Math.min(...down)).toBeGreaterThanOrEqual(0.4 * out.height - 1);
  expect(Math.max(...down)).toBeLessThanOrEqual(0.85 * out.height + 1);
  expect(Math.min(...out.sleeps)).toBeGreaterThanOrEqual(3000);
  expect(Math.max(...out.sleeps)).toBeLessThanOrEqual(25000);
  expect(new Set(out.sleeps).size).toBeGreaterThan(out.sleeps.length * 0.8);
  expect(out.clicks).toBe(0);
});

test("now and then scrolls back up a little, but never on the first step", async ({ page }) => {
  const out = await run(page, { rng: 0.05, leadsPerStep: 0, maxMs: 10 ** 9 });
  expect(out.scrolls[0]).toBeGreaterThan(0);
  expect(out.scrolls.slice(1).every((d) => d < 0 && d >= -0.3 * out.height - 1)).toBe(true);
});

test("stops when there is enough, at the end of the feed, or when time is up", async ({ page }) => {
  expect((await run(page, { leadsPerStep: 10, maxLeads: 30 })).result).toMatchObject({ reason: "enough", leads: 30 });
  await page.unroute("**/*");
  expect((await run(page, { scan: "idle" })).result).toMatchObject({ reason: "end", steps: 4 });
  await page.unroute("**/*");
  expect((await run(page, { leadsPerStep: 0, maxMs: 60_000, clockStepMs: 20_000, maxPosts: 10 ** 6 })).result.reason).toBe("time");
});

test("stops at once when you touch the page, switch tab, leave the group, press Stop or sending fails", async ({ page }) => {
  expect((await run(page, { touchAt: 2, leadsPerStep: 0, maxPosts: 10 ** 6 })).result).toMatchObject({ reason: "touched", steps: 2 });
  await page.unroute("**/*");
  expect((await run(page, { hide: 3, leadsPerStep: 0, maxPosts: 10 ** 6 })).result.reason).toBe("hidden");
  await page.unroute("**/*");
  expect((await run(page, { leaveAt: 3, leadsPerStep: 0, maxPosts: 10 ** 6 })).result.reason).toBe("left");
  await page.unroute("**/*");
  expect((await run(page, { abortAt: 2, leadsPerStep: 0, maxPosts: 10 ** 6 })).result.reason).toBe("stopped");
  await page.unroute("**/*");
  expect((await run(page, { scan: "fail" })).result).toMatchObject({ reason: "problem", steps: 0 });
});
