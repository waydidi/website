import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

// The Collect button's scroller (extensions/fb-leads/runner.js). The page is real and really scrolls; the clock, the
// pauses and the scanner are faked so a run is instant. The scroll calls and pauses it asks for are recorded and
// checked. Nothing here touches Facebook.
const RUNNER = path.join(process.cwd(), "extensions", "fb-leads", "runner.js");
const PAGE = "https://www.facebook.com/groups/test/";

// posts: 4 new posts every screen. known: posts on screen were all sent before (a second run over the same feed).
// blank: no readable post at all. fail: sending is refused.
// hide: the tab is reported hidden from this scan call onward (and forever, unless hideUntilCall is also given).
// hideUntilCall: the tab becomes visible again from this call onward (simulates a brief switch away and back).
// growOnCatchUpAt: the Nth scrollTo call (the catch-up attempt made when a screen looks stuck) grows the page, as if
// Facebook's own "load more" had just landed a moment after the scroll — simulating a slower, not a genuinely empty, feed.
type Opts = { scan?: "posts" | "known" | "blank" | "fail"; leadsPerStep?: number; rng?: number[] | number; maxMs?: number; clockStepMs?: number; hide?: number; hideUntilCall?: number; hiddenGraceMs?: number; touchAt?: number; leaveAt?: number; abortAt?: number; maxPosts?: number; maxLeads?: number; maxSteps?: number; pageHeight?: number; growOnCatchUpAt?: number };
type Out = { result: { reason: string; posts: number; leads: number; steps: number; read: boolean }; scrolls: number[]; sleeps: number[]; scrollTos: number; clicks: number; height: number };

async function run(page: Page, opts: Opts = {}): Promise<Out> {
  await page.unroute(PAGE).catch(() => undefined);
  await page.route(PAGE, (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><title>t</title><div style='height:${opts.pageHeight ?? 40000}px'>feed</div>` }));
  await page.goto(PAGE);
  await page.addScriptTag({ path: RUNNER });
  return page.evaluate(async (o: Opts) => {
    const w = window as unknown as { WaydidiLeads: { collect: (x: Record<string, unknown>) => Promise<Out["result"]> } };
    const scrolls: number[] = [], sleeps: number[] = [];
    let clicks = 0, calls = 0, clock = 0, n = 0;
    document.addEventListener("click", () => clicks++, true);
    const realScrollBy = window.scrollBy.bind(window);
    window.scrollBy = ((arg: ScrollToOptions) => { scrolls.push(arg.top as number); realScrollBy({ top: arg.top, behavior: "instant" }); }) as typeof window.scrollBy;
    let scrollTos = 0;
    const realScrollTo = window.scrollTo.bind(window);
    const feedDiv = document.querySelector("div") as HTMLDivElement;
    window.scrollTo = ((arg: ScrollToOptions) => {
      scrollTos++;
      if (o.growOnCatchUpAt === scrollTos && feedDiv) feedDiv.style.height = (parseInt(feedDiv.style.height, 10) + 3000) + "px";
      realScrollTo({ top: arg.top, behavior: "instant" });
    }) as typeof window.scrollTo;
    if (o.hide !== undefined) Object.defineProperty(document, "hidden", { configurable: true, get: () => calls >= (o.hide as number) && (o.hideUntilCall === undefined || calls < (o.hideUntilCall as number)) });
    const seq = Array.isArray(o.rng) ? o.rng : null;
    const rng = () => (seq ? seq[n++ % seq.length] : typeof o.rng === "number" ? o.rng : (n++ * 0.37 + 0.11) % 1);
    const abort = new AbortController();
    const result = await w.WaydidiLeads.collect({
      win: window, rng, signal: abort.signal, maxMs: o.maxMs, maxPosts: o.maxPosts, maxLeads: o.maxLeads, maxSteps: o.maxSteps, hiddenGraceMs: o.hiddenGraceMs,
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
        if (o.scan === "blank") return { posts: 0, leads: 0, visible: 0 };
        if (o.scan === "known") return { posts: 0, leads: 0, visible: 6 };
        return { posts: 4, leads: o.leadsPerStep ?? 1, visible: 6 };
      },
    });
    return { result, scrolls, sleeps, scrollTos, clicks, height: window.innerHeight };
  }, opts);
}

test("reads like a person: uneven distances, pauses of different lengths within human range, never clicks", async ({ page }) => {
  const out = await run(page, { maxLeads: 25 });
  expect(out.result.reason).toBe("enough");
  expect(out.scrolls.length).toBeGreaterThan(10);
  const down = out.scrolls.filter((d) => d > 0);
  expect(new Set(out.scrolls).size).toBeGreaterThan(out.scrolls.length * 0.8); // no repeating rhythm
  expect(Math.min(...down)).toBeGreaterThanOrEqual(0.4 * out.height - 1);
  expect(Math.max(...down)).toBeLessThanOrEqual(0.85 * out.height + 1);
  expect(Math.min(...out.sleeps)).toBeGreaterThanOrEqual(2000);
  expect(Math.max(...out.sleeps)).toBeLessThanOrEqual(15000);
  expect(new Set(out.sleeps).size).toBeGreaterThan(out.sleeps.length * 0.8);
  expect(out.clicks).toBe(0);
});

test("now and then scrolls back up a little, but never on the first step", async ({ page }) => {
  const out = await run(page, { rng: 0.05, scan: "known", maxSteps: 6 });
  expect(out.scrolls[0]).toBeGreaterThan(0);
  expect(out.scrolls.slice(1).every((d) => d < 0 && d >= -0.3 * out.height - 1)).toBe(true);
});

test("keeps going until it has the target number of lead posts; ignored posts do not count", async ({ page }) => {
  // Every screen has 4 new posts of which 1 is a lead: 10 leads means looking at 40 posts.
  const out = await run(page, { maxLeads: 10, leadsPerStep: 1 });
  expect(out.result).toMatchObject({ reason: "enough", leads: 10, posts: 40 });
});

test("has no time limit unless one is given; a safety stop ends a run that looked at too many posts", async ({ page }) => {
  // An hour passes on every screen and still nothing stops the run until its leads are in.
  expect((await run(page, { maxLeads: 8, leadsPerStep: 1, clockStepMs: 3_600_000 })).result.reason).toBe("enough");
  expect((await run(page, { maxLeads: 50, leadsPerStep: 0, maxPosts: 40 })).result).toMatchObject({ reason: "looked", leads: 0, posts: 40 });
});

test("scrolls past posts it already sent, to reach new ones (it does not call that the end of the feed)", async ({ page }) => {
  const out = await run(page, { scan: "known", maxSteps: 25, maxMs: 10 ** 9, clockStepMs: 1 });
  expect(out.result).toMatchObject({ reason: "steps", steps: 25, posts: 0 });
});

test("ends only when the page really stops moving and growing", async ({ page }) => {
  const out = await run(page, { scan: "known", pageHeight: 1800, maxMs: 10 ** 9, clockStepMs: 1 });
  expect(out.result.reason).toBe("end");
  expect(out.result.steps).toBeLessThan(12);
  // Each stuck-looking screen gets one catch-up scroll-to-bottom and one longer wait (3 to 6s) before it counts,
  // in case Facebook was just about to load more — this is what the owner's "end of feed" report turned out to need.
  expect(out.scrollTos).toBeGreaterThan(0);
  expect(out.sleeps.filter((ms) => ms >= 3000 && ms <= 6000).length).toBeGreaterThan(0);
});

test("a screen that looks stuck but grows once given the extra catch-up wait is not treated as the end", async ({ page }) => {
  // Reaches the (small) bottom almost at once, looks stuck, but the very first catch-up attempt reveals more content
  // (a slightly slow Facebook, not an empty one): the run must keep going instead of stopping with "end".
  const out = await run(page, { scan: "known", pageHeight: 900, growOnCatchUpAt: 1, maxSteps: 6, maxMs: 10 ** 9, clockStepMs: 1 });
  expect(out.result).toMatchObject({ reason: "steps", steps: 6 });
});

test("says so when no post on the page can be read, instead of pretending it reached the end", async ({ page }) => {
  expect((await run(page, { scan: "blank" })).result).toMatchObject({ reason: "unreadable", steps: 3, read: false });
});

test("reports whether any post was read, so a run that read nothing does not use up one of the day's runs", async ({ page }) => {
  expect((await run(page, { scan: "fail" })).result.read).toBe(false);
  expect((await run(page, { scan: "known", maxSteps: 3 })).result.read).toBe(true); // posts sent before still count as read
  expect((await run(page, { maxLeads: 2 })).result.read).toBe(true);
});

test("stops when time is up", async ({ page }) => {
  expect((await run(page, { scan: "known", maxMs: 60_000, clockStepMs: 20_000 })).result.reason).toBe("time");
});

test("stops at once when you touch the page, leave the group, press Stop or sending fails", async ({ page }) => {
  expect((await run(page, { touchAt: 2, scan: "known" })).result).toMatchObject({ reason: "touched", steps: 2 });
  expect((await run(page, { leaveAt: 3, scan: "known" })).result.reason).toBe("left");
  expect((await run(page, { abortAt: 2, scan: "known" })).result.reason).toBe("stopped");
  expect((await run(page, { scan: "fail" })).result).toMatchObject({ reason: "problem", steps: 0 });
});

test("a brief switch away (under the grace period) does not stop the run", async ({ page }) => {
  // Hidden for calls 2 and 3 only (2 steps x 10s = 20s, well under the 2-minute default), visible again from call 4.
  const out = await run(page, { hide: 2, hideUntilCall: 4, scan: "known", clockStepMs: 10_000, maxSteps: 8 });
  expect(out.result).toMatchObject({ reason: "steps", steps: 8 });
});

test("switching away twice, each time briefly, never stops the run (each return resets the grace period)", async ({ page }) => {
  const out = await run(page, { hide: 2, hideUntilCall: 4, hiddenGraceMs: 25_000, scan: "known", clockStepMs: 10_000, maxSteps: 10 });
  expect(out.result).toMatchObject({ reason: "steps", steps: 10 });
});

test("staying hidden longer than the grace period stops the run, with reason \"hidden\"", async ({ page }) => {
  // Hidden from call 2 onward, never visible again; at 10s a step it crosses the (shortened, for a fast test) 25s grace on the 4th check.
  const out = await run(page, { hide: 2, hiddenGraceMs: 25_000, scan: "known", clockStepMs: 10_000, maxSteps: 10 ** 6, maxMs: 10 ** 9 });
  expect(out.result.reason).toBe("hidden");
  expect(out.result.steps).toBe(5); // 2 steps visible, then hidden through steps 3,4,5 (30s > 25s grace) before halting
});
