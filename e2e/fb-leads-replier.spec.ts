import { expect, test, type Page } from "@playwright/test";
import path from "node:path";

// The reply queue's page helpers (extensions/fb-leads/replier.js): find the comment box, put the draft in it, and count
// comments by the Waydidi names. These pages copy the shape of a Facebook post page with made-up content; they do not
// touch Facebook. Finding, filling and counting must never press Post or Enter: every click, Enter key and form submit
// is recorded. Only submitComment (used for a comment approved in Telegram) presses send, and only in its own composer.
const REPLIER = path.join(process.cwd(), "extensions", "fb-leads", "replier.js");
type Helpers = {
  findCommentBox: (d: Document) => HTMLElement | null;
  fillComment: (d: Document, box: HTMLElement, text: string) => Promise<string>;
  ourComments: (d: Document, names: string[], box: HTMLElement | null) => number;
};

const comment = (author: string, text: string) => `<div role="article" aria-label="Comment by ${author} 5 minutes ago"><a href="/u/1">${author}</a><div dir="auto">${text}</div></div>`;
// pasteAware: behaves like Facebook's editor, which inserts pasted text itself.
const postPage = (opts: { pasteAware?: boolean; boxText?: string; comments?: string; hiddenBox?: boolean } = {}) => `
  <div role="banner"><div contenteditable="true" role="textbox" aria-label="Search Facebook"></div></div>
  <div role="article" aria-label="Post">
    <div dir="auto">Need a driver from BKK airport to Pattaya for 4 people tomorrow</div>
    <div class="comments">${opts.comments ?? ""}</div>
    <form><div contenteditable="true" role="textbox" aria-label="Write a public comment…" style="min-height:20px;${opts.hiddenBox ? "display:none" : ""}" ${opts.pasteAware ? "data-paste-aware" : ""}>${opts.boxText ?? ""}</div>
    <button type="submit" aria-label="Post comment">Post</button></form>
  </div>`;

async function load(page: Page, html: string) {
  await page.setContent(`<!doctype html><html><body>${html}</body></html>`);
  await page.evaluate(() => {
    const w = window as unknown as { pressed: string[] };
    w.pressed = [];
    document.addEventListener("click", (e) => w.pressed.push("click:" + (e.target as HTMLElement).tagName), true);
    document.addEventListener("keydown", (e) => { if (e.key === "Enter") w.pressed.push("enter"); }, true);
    document.addEventListener("submit", (e) => { e.preventDefault(); w.pressed.push("submit"); }, true);
    const box = document.querySelector<HTMLElement>("[data-paste-aware]");
    box?.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e as ClipboardEvent).clipboardData?.getData("text/plain") ?? "";
      box.innerText = text;
    });
  });
  await page.addScriptTag({ path: REPLIER });
}

const run = <T,>(page: Page, fn: (h: Helpers) => T) =>
  page.evaluate(`(${fn.toString()})(window.WaydidiLeads)`) as Promise<T>;

const DRAFT = "Hi! A private van from BKK airport to Pattaya takes about 2 hours.\nWe can do it door to door: waydidi.com";

test("finds the visible comment box, not the search box", async ({ page }) => {
  await load(page, postPage());
  expect(await run(page, (h) => h.findCommentBox(document)?.getAttribute("aria-label"))).toBe("Write a public comment…");
  await load(page, postPage({ hiddenBox: true }));
  expect(await run(page, (h) => h.findCommentBox(document))).toBeNull();
});

test("puts the draft in Facebook's editor as a paste, line breaks kept, and never presses Post or Enter", async ({ page }) => {
  await load(page, postPage({ pasteAware: true }));
  const out = await page.evaluate(`(async () => { const h = window.WaydidiLeads, box = h.findCommentBox(document); return { r: await h.fillComment(document, box, ${JSON.stringify(DRAFT)}), text: box.innerText, pressed: window.pressed }; })()`) as { r: string; text: string; pressed: string[] };
  expect(out.r).toBe("filled");
  expect(out.text).toBe(DRAFT);
  expect(out.pressed).toEqual([]);
});

test("an editor that ignores the paste gets the text typed in, line breaks as spaces (a typed line break can send)", async ({ page }) => {
  await load(page, postPage());
  const out = await page.evaluate(`(async () => { const h = window.WaydidiLeads, box = h.findCommentBox(document); return { r: await h.fillComment(document, box, ${JSON.stringify(DRAFT)}), text: box.textContent, pressed: window.pressed }; })()`) as { r: string; text: string; pressed: string[] };
  expect(out.r).toBe("filled");
  expect(out.text).toBe(DRAFT.replace("\n", " "));
  expect(out.pressed).toEqual([]);
});

test("a comment box that already has text is left alone", async ({ page }) => {
  await load(page, postPage({ pasteAware: true, boxText: "my own words" }));
  const out = await page.evaluate(`(async () => { const h = window.WaydidiLeads, box = h.findCommentBox(document); return { r: await h.fillComment(document, box, "draft"), text: box.textContent }; })()`) as { r: string; text: string };
  expect(out).toEqual({ r: "busy", text: "my own words" });
});

test("counts comments by the Waydidi names only, never the post holding the draft, and notices a new one", async ({ page }) => {
  await load(page, postPage({ pasteAware: true, comments: comment("Someone Else", "Try Grab") + comment("Waydidi Travel", "We did this route yesterday") }));
  const before = await page.evaluate(`(async () => { const h = window.WaydidiLeads, box = h.findCommentBox(document); await h.fillComment(document, box, "Waydidi Travel can help"); return h.ourComments(document, ["waydidi travel"], box); })()`);
  expect(before).toBe(1);
  await page.evaluate((html) => { document.querySelector(".comments")!.insertAdjacentHTML("beforeend", html); }, comment("Waydidi Travel", "Waydidi Travel can help"));
  expect(await page.evaluate(`window.WaydidiLeads.ourComments(document, ["Waydidi Travel"], window.WaydidiLeads.findCommentBox(document))`)).toBe(2);
  expect(await page.evaluate(`window.WaydidiLeads.ourComments(document, [], null)`)).toBe(0);
});

// Only for a comment approved in Telegram: submitComment presses the send button in the box's own composer.
const submit = (page: Page) => page.evaluate(`(async () => { const h = window.WaydidiLeads, box = h.findCommentBox(document); await h.fillComment(document, box, "Waydidi Travel can help"); return { how: h.submitComment(document, box), pressed: window.pressed }; })()`) as Promise<{ how: string; pressed: string[] }>;

test("submitComment presses the send button of this comment box only", async ({ page }) => {
  // Another post's composer, with its own send button, comes first on the page: it must not be pressed.
  const other = `<div role="article" aria-label="Other post"><div><div contenteditable="true" role="textbox" aria-label="Search this group"></div><div role="button" aria-label="Comment" id="other-send">x</div></div></div>`;
  await load(page, other + postPage({ pasteAware: true }));
  await page.evaluate(() => document.getElementById("other-send")!.addEventListener("click", () => (window as unknown as { pressed: string[] }).pressed.push("WRONG")));
  const out = await submit(page);
  expect(out.how).toBe("button");
  expect(out.pressed).toEqual(["click:BUTTON", "submit"]);
});

test("submitComment presses Enter in the box when there is no send button; does nothing on an empty box", async ({ page }) => {
  await load(page, `<div role="article" aria-label="Post"><div contenteditable="true" role="textbox" aria-label="Write a comment" data-paste-aware style="min-height:20px"></div></div>`);
  await page.evaluate(() => { const b = document.querySelector("[data-paste-aware]") as HTMLElement; b.addEventListener("paste", (e) => { e.preventDefault(); b.innerText = (e as ClipboardEvent).clipboardData?.getData("text/plain") ?? ""; }); });
  const out = await submit(page);
  expect(out).toEqual({ how: "enter", pressed: ["enter"] });
  await load(page, `<div role="article"><div contenteditable="true" role="textbox" aria-label="Write a comment" style="min-height:20px"></div></div>`);
  expect(await page.evaluate(`(() => { const h = window.WaydidiLeads; return { how: h.submitComment(document, h.findCommentBox(document)), pressed: window.pressed }; })()`)).toEqual({ how: "none", pressed: [] });
});

test("a disabled send button is not pressed", async ({ page }) => {
  await load(page, `<div role="article" aria-label="Post"><form><div contenteditable="true" role="textbox" aria-label="Write a comment" style="min-height:20px"></div><div role="button" aria-label="Comment" aria-disabled="true">x</div></form></div>`);
  const out = await submit(page);
  expect(out.how).toBe("enter");
  expect(out.pressed).toEqual(["enter"]);
});

test("Facebook's editor writes a paste a moment later: the draft goes in once, never twice", async ({ page }) => {
  // Like Facebook: the editor takes the paste (cancels the browser's own handling) and writes the text 300 ms later.
  await load(page, postPage());
  await page.evaluate(() => {
    const b = document.querySelector('[aria-label="Write a public comment…"]') as HTMLElement;
    b.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e as ClipboardEvent).clipboardData?.getData("text/plain") ?? "";
      setTimeout(() => { b.innerText = b.innerText.trim() ? b.innerText + text : text; }, 300);
    });
  });
  const out = await page.evaluate(`(async () => { const h = window.WaydidiLeads, box = h.findCommentBox(document); const r = await h.fillComment(document, box, ${JSON.stringify(DRAFT)}); await new Promise((ok) => setTimeout(ok, 500)); return { r, text: box.innerText, pressed: window.pressed }; })()`) as { r: string; text: string; pressed: string[] };
  expect(out.r).toBe("filled");
  expect(out.text).toBe(DRAFT);
  expect(out.pressed).toEqual([]);
});

test("an editor that took the paste but never wrote it: failed, and nothing typed in instead", async ({ page }) => {
  await load(page, postPage());
  await page.evaluate(() => { document.querySelector('[aria-label="Write a public comment…"]')!.addEventListener("paste", (e) => e.preventDefault()); });
  const out = await page.evaluate(`(async () => { const h = window.WaydidiLeads, box = h.findCommentBox(document); return { r: await h.fillComment(document, box, "Hello there, Waydidi here"), text: box.textContent }; })()`) as { r: string; text: string };
  expect(out).toEqual({ r: "failed", text: "" });
});

test("a posted comment is noticed by its words, whatever Facebook name posted it; the draft still in the box is not", async ({ page }) => {
  const draft = "Hi! 😊 Since Clark Airport is in the Philippines, the private part of your trip starts in Bangkok.";
  await load(page, postPage({ pasteAware: true, comments: comment("Someone Else", "Try Grab, it works fine") }));
  const like = (text: string) => page.evaluate(`window.WaydidiLeads.commentsLike(document, ${JSON.stringify(text)})`);
  await page.evaluate(`(async () => { const h = window.WaydidiLeads; await h.fillComment(document, h.findCommentBox(document), ${JSON.stringify(draft)}); })()`);
  expect(await like(draft)).toBe(0); // only in the comment box so far
  // Posted from a staff member's own profile; Facebook shows the emoji as a picture, so the text has none.
  await page.evaluate((html) => { document.querySelector(".comments")!.insertAdjacentHTML("beforeend", html); },
    comment("Non Staff", 'Hi! <img alt="😊" src="data:,"> Since Clark Airport is in the Philippines, the private part of your trip starts in Bangkok.'));
  expect(await like(draft)).toBe(1);
  expect(await like("Hi!")).toBe(0); // too short to tell
});
