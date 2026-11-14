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

// The page's name becomes a real tag: "@" + name is typed and Facebook's suggestion is clicked (never Post).
const TAG_TEXT = "Waydidi Travel can arrange private airport pickups. WhatsApp: +66 63 206 4884";
// How the copied suggestion list takes a choice. "pointer": like Facebook, only a real pointer press with a position
// counts (a bare .click() or a mousedown without coordinates is ignored). "tab": only Tab in the box. "never": nothing.
async function tagPage(page: Page, suggest: boolean, takes: "pointer" | "tab" | "never" = "pointer") {
  await load(page, `<div role="article" aria-label="Post"><form><div contenteditable="true" role="textbox" aria-label="Write a comment" style="min-height:20px">${TAG_TEXT}</div><button type="submit" aria-label="Post comment">Post</button></form><div id="menu"></div></div>`);
  await page.evaluate(({ suggest, takes }) => {
    const box = document.querySelector('[role="textbox"]') as HTMLElement, menu = document.getElementById("menu")!;
    const choose = () => { box.innerHTML = box.innerHTML.replace("@Waydidi Travel", '<a href="/waydiditravel">Waydidi Travel</a>'); menu.innerHTML = ""; };
    // Like Facebook: typing "@" and a name shows a list of suggestions; choosing one turns it into a link.
    box.addEventListener("input", () => {
      if (suggest && box.textContent!.includes("@Waydidi Travel") && !menu.firstChild) menu.innerHTML = '<div role="listbox"><div role="option" id="opt"><span>Waydidi Travel</span><br><small>Travel company</small></div></div>';
    });
    menu.addEventListener("pointerdown", (e) => { if (takes === "pointer" && (e as PointerEvent).clientX > 0 && (e.target as HTMLElement).closest('[role="option"]')) choose(); });
    box.addEventListener("keydown", (e) => { if (takes === "tab" && e.key === "Tab" && menu.firstChild) { e.preventDefault(); choose(); } });
  }, { suggest, takes });
}

test("tagName: types @ and the page name, clicks Facebook's suggestion, never Post or Enter", async ({ page }) => {
  await tagPage(page, true);
  const out = await page.evaluate(`(async () => { const h = window.WaydidiLeads, box = h.findCommentBox(document); const r = await h.tagName(document, box, "Waydidi Travel"); return { r, html: box.innerHTML, pressed: window.pressed }; })()`) as { r: string; html: string; pressed: string[] };
  expect(out.r).toBe("tagged");
  expect(out.html).toContain('<a href="/waydiditravel">Waydidi Travel</a> can arrange');
  expect(out.html).not.toContain("@");
  expect(out.pressed.filter((p) => p === "submit" || p === "enter")).toEqual([]);
});

test("tagName: no suggestion from Facebook puts the plain name back; a comment without the name is left alone", async ({ page }) => {
  await tagPage(page, false);
  const out = await page.evaluate(`(async () => { const h = window.WaydidiLeads, box = h.findCommentBox(document); const r = await h.tagName(document, box, "Waydidi Travel"); return { r, text: box.textContent, pressed: window.pressed }; })()`) as { r: string; text: string; pressed: string[] };
  expect(out.r).toBe("no_suggestion");
  expect(out.text).toBe(TAG_TEXT);
  expect(out.pressed).toEqual([]);
  expect(await page.evaluate(`(async () => { const h = window.WaydidiLeads; return h.tagName(document, h.findCommentBox(document), "Another Page"); })()`)).toBe("absent");
});

test("isSalesComment: a comment with WhatsApp and a phone number", async ({ page }) => {
  await load(page, postPage());
  const out = await page.evaluate(`(() => { const h = window.WaydidiLeads; return [h.isSalesComment(${JSON.stringify(TAG_TEXT)}), h.isSalesComment("Message us on WhatsApp for details"), h.isSalesComment("Try the Grab app, it works fine"), h.isSalesComment("whatsapp 0632064884")]; })()`);
  expect(out).toEqual([true, false, false, true]);
});

// The QR picture: given to the comment's own photo input (inside the same post); Facebook then shows a preview.
async function picturePage(page: Page, withInput: boolean, preview = true) {
  const other = `<div role="article" aria-label="Other post"><input type="file" id="other" accept="image/*"></div>`;
  await load(page, other + `<div role="article" aria-label="Post"><form><div contenteditable="true" role="textbox" aria-label="Write a comment" style="min-height:20px">Hello</div>${withInput ? '<input type="file" id="mine" accept="image/*,video/*" style="display:none">' : ""}<div id="previews"></div><button type="submit" aria-label="Post comment">Post</button></form></div>`);
  await page.evaluate(({ withInput, preview }) => {
    const show = (file: File) => { if (preview) { const img = document.createElement("img"); img.src = URL.createObjectURL(file); document.getElementById("previews")!.appendChild(img); } };
    if (withInput) document.getElementById("mine")!.addEventListener("change", (e) => show((e.target as HTMLInputElement).files![0]));
    else document.querySelector('[role="textbox"]')!.addEventListener("paste", (e) => { const f = (e as ClipboardEvent).clipboardData?.files[0]; if (f) { e.preventDefault(); show(f); } });
    document.getElementById("other")!.addEventListener("change", () => (window as unknown as { pressed: string[] }).pressed.push("WRONG INPUT"));
  }, { withInput, preview });
}
const attach = (page: Page) => page.evaluate(`(async () => { const h = window.WaydidiLeads, box = h.findCommentBox(document); const file = new File([new Uint8Array([255, 216, 255])], "Waydidi_QR.jpg", { type: "image/jpeg" }); const r = await h.attachPicture(document, box, file); const mine = document.getElementById("mine"); return { r, name: mine && mine.files[0] ? mine.files[0].name : null, previews: document.querySelectorAll("#previews img").length, pressed: window.pressed }; })()`) as Promise<{ r: string; name: string | null; previews: number; pressed: string[] }>;

test("attachPicture: the QR goes to this comment's photo input, Facebook shows the preview, nothing is sent", async ({ page }) => {
  await picturePage(page, true);
  expect(await attach(page)).toEqual({ r: "attached", name: "Waydidi_QR.jpg", previews: 1, pressed: [] });
});

test("attachPicture: with no photo input the picture is pasted into the box", async ({ page }) => {
  await picturePage(page, false);
  expect(await attach(page)).toEqual({ r: "attached", name: null, previews: 1, pressed: [] });
});

test("attachPicture: no preview within 10 seconds is reported as failed", async ({ page }) => {
  test.setTimeout(30_000);
  await picturePage(page, true, false);
  expect((await attach(page)).r).toBe("failed");
});

const runTag = (page: Page) => page.evaluate(`(async () => { const h = window.WaydidiLeads, box = h.findCommentBox(document); const r = await h.tagName(document, box, "Waydidi Travel"); return { r, html: box.innerHTML, text: box.textContent, pressed: window.pressed }; })()`) as Promise<{ r: string; html: string; text: string; pressed: string[] }>;

test("tagName: a list that ignores a bare click (like Facebook) still takes the mouse-like press on the suggestion", async ({ page }) => {
  await tagPage(page, true, "pointer");
  // A bare click, as the first version sent, is ignored by this list.
  await page.evaluate(() => { document.querySelector('[role="textbox"]')!.textContent += ""; });
  const out = await runTag(page);
  expect(out.r).toBe("tagged");
  expect(out.html).toContain('<a href="/waydiditravel">Waydidi Travel</a> can arrange');
  expect(out.pressed.filter((p) => p === "submit" || p === "enter")).toEqual([]);
});

test("tagName: when the press is not taken, Tab chooses the suggestion (never Enter)", async ({ page }) => {
  await tagPage(page, true, "tab");
  const out = await runTag(page);
  expect(out.r).toBe("tagged");
  expect(out.html).toContain('<a href="/waydiditravel">Waydidi Travel</a>');
  expect(out.pressed.filter((p) => p === "submit" || p === "enter")).toEqual([]);
});

test("tagName: a suggestion that takes nothing is reported, the plain name is put back, and nothing is sent", async ({ page }) => {
  test.setTimeout(30_000);
  await tagPage(page, true, "never");
  const out = await runTag(page);
  expect(out.r).toBe("not_selected");
  expect(out.text).toBe(TAG_TEXT);
  expect(out.pressed.filter((p) => p === "submit" || p === "enter")).toEqual([]);
});

// Like the post first: only the post's own Like button, pressed like a mouse; a comment's Like is never touched.
async function likePageFor(page: Page, opts: { marker?: boolean; alreadyLiked?: boolean; takes?: boolean } = {}) {
  const { marker = true, alreadyLiked = false, takes = true } = opts;
  const postLike = marker
    ? `<div role="button" aria-label="${alreadyLiked ? "Remove Like" : "Like"}" id="postLike"><span data-ad-rendering-role="like_button">Like</span></div>`
    : `<div role="button" aria-label="${alreadyLiked ? "Remove Like" : "Like"}" id="postLike">Like</div>`;
  await load(page, `<div role="article" aria-label="Post"><div dir="auto">Need a van to Pattaya</div>${postLike}
    <div class="comments"><div role="article" aria-label="Comment by Someone"><div dir="auto">Try Grab</div><div role="button" aria-label="Like" id="commentLike">Like</div></div></div>
    <form><div contenteditable="true" role="textbox" aria-label="Write a comment" style="min-height:20px"></div><button type="submit" aria-label="Post comment">Post</button></form></div>`);
  await page.evaluate((takes) => {
    const w = window as unknown as { pressed: string[] };
    // Like Facebook: only a real pointer press with a position counts; the button then shows it is pressed.
    document.getElementById("postLike")!.addEventListener("pointerdown", (e) => {
      if (takes && (e as PointerEvent).clientX > 0) { const b = document.getElementById("postLike")!; b.setAttribute("aria-label", "Remove Like"); b.setAttribute("aria-pressed", "true"); }
    });
    document.getElementById("commentLike")!.addEventListener("click", () => w.pressed.push("COMMENT LIKE"));
  }, takes);
}
const like = (page: Page) => page.evaluate(`(async () => { const h = window.WaydidiLeads; const r = await h.likePost(document, h.findCommentBox(document)); return { r, label: document.getElementById("postLike").getAttribute("aria-label"), pressed: window.pressed.filter((p) => p !== "click:DIV" && p !== "click:SPAN") }; })()`) as Promise<{ r: string; label: string; pressed: string[] }>;

test("likePost: presses the post's own Like button (Facebook's marker), never a comment's, never Post", async ({ page }) => {
  await likePageFor(page);
  expect(await like(page)).toEqual({ r: "liked", label: "Remove Like", pressed: [] });
});

test("likePost: without Facebook's marker, the post's Like button by its label; a comment's Like is skipped", async ({ page }) => {
  await likePageFor(page, { marker: false });
  expect(await like(page)).toEqual({ r: "liked", label: "Remove Like", pressed: [] });
});

test("likePost: an already-liked post is not pressed again (pressing would remove the Like)", async ({ page }) => {
  await likePageFor(page, { alreadyLiked: true });
  expect(await like(page)).toEqual({ r: "already", label: "Remove Like", pressed: [] });
});

test("likePost: a press Facebook does not take is reported; no Like button at all is reported too", async ({ page }) => {
  await likePageFor(page, { takes: false });
  expect((await like(page)).r).toBe("not_taken");
  await load(page, postPage());
  expect(await page.evaluate(`(async () => { const h = window.WaydidiLeads; return h.likePost(document, h.findCommentBox(document)); })()`)).toBe("none");
});
