import { expect, test } from "@playwright/test";
import path from "node:path";

// The Facebook leads browser extension (extensions/fb-leads/extractor.js) reads the posts on screen. These pages copy
// the shape of a Facebook group feed (nested comments, author links, tracking parameters, truncated text) with made-up
// content; they do not touch Facebook. Facebook changes its markup over time: when the extension stops finding posts,
// add the new shape here first.
const EXTRACTOR = path.join(process.cwd(), "extensions", "fb-leads", "extractor.js");
type Post = { url: string; text: string; groupName: string };

async function read(page: import("@playwright/test").Page, html: string, title = "(3) Koh Chang Community | Facebook"): Promise<Post[]> {
  await page.setContent(`<!doctype html><html><head><title>${title}</title></head><body>${html}</body></html>`);
  await page.addScriptTag({ path: EXTRACTOR });
  return page.evaluate(() => (window as unknown as { WaydidiLeads: { findPosts: (d: Document) => Post[] } }).WaydidiLeads.findPosts(document));
}

const post = (opts: { id: string; text: string; kind?: string; marker?: boolean }) => `
  <div role="article">
    <h2><a href="/groups/111/user/999/?__cft__[0]=AZ">Someone Else</a></h2>
    <a href="/groups/111/${opts.kind ?? "posts"}/${opts.id}/?__cft__[0]=AZabc&__tn__=%2CO%2CP-R">2h</a>
    ${opts.marker === false ? `<div dir="auto">${opts.text}</div>` : `<div data-ad-rendering-role="story_message"><div dir="auto">${opts.text}</div></div>`}
    <div role="button">Like</div>
    <div role="article">
      <a href="/groups/111/posts/${opts.id}/?comment_id=555">5m</a>
      <div dir="auto">Try the Grab app, it works fine on the island, honestly.</div>
    </div>
  </div>`;

test("reads the link, text and group name of each post, and ignores comments and authors", async ({ page }) => {
  const posts = await read(page, `<div role="feed">
    ${post({ id: "1234567890", text: "Looking for a driver from Trat airport to Koh Chang for 4 people on 20 December" })}
    ${post({ id: "pfbid02AbCdEf123456", text: "Which beach is best for kids in January? We have a 3 year old." })}
  </div>`);
  expect(posts.map((p) => p.url)).toEqual([
    "https://www.facebook.com/groups/111/posts/1234567890/?__cft__[0]=AZabc&__tn__=%2CO%2CP-R",
    "https://www.facebook.com/groups/111/posts/pfbid02AbCdEf123456/?__cft__[0]=AZabc&__tn__=%2CO%2CP-R",
  ]);
  expect(posts[0].text).toBe("Looking for a driver from Trat airport to Koh Chang for 4 people on 20 December");
  expect(posts.every((p) => p.groupName === "Koh Chang Community")).toBe(true);
  expect(JSON.stringify(posts)).not.toContain("Someone Else");
  expect(JSON.stringify(posts)).not.toContain("Grab app");
});

test("reads the permalink form and falls back to the longest text block when Facebook's markers are missing", async ({ page }) => {
  const posts = await read(page, post({ id: "777888999", kind: "permalink", marker: false, text: "Can anyone recommend a reliable van with a child seat for Bangkok to Hua Hin?" }));
  expect(posts).toHaveLength(1);
  expect(posts[0].url).toContain("/groups/111/permalink/777888999/");
  expect(posts[0].text).toContain("child seat");
});

test("leaves out posts with no link or almost no text, and a post shown twice is read once", async ({ page }) => {
  const posts = await read(page, `
    <div role="article"><div data-ad-rendering-role="story_message"><div dir="auto">A long enough post but with no link anywhere in it</div></div></div>
    <div role="article"><a href="/groups/111/posts/1000001/">1h</a><div data-ad-rendering-role="story_message"><div dir="auto">Hi</div></div></div>
    ${post({ id: "2000002", text: "Need a taxi from Pattaya to Don Mueang tomorrow morning" })}
    ${post({ id: "2000002", text: "Need a taxi from Pattaya to Don Mueang tomorrow morning" })}`);
  expect(posts.map((p) => p.url.split("?")[0])).toEqual(["https://www.facebook.com/groups/111/posts/2000002/"]);
});

test("keeps line breaks, and a page still titled just Facebook has no group name", async ({ page }) => {
  const posts = await read(page, post({ id: "3000003", text: "Hello everyone,<br><br><br><br>Need a tour guide for two days in Chiang Mai?" }), "Facebook");
  expect(posts[0].text).toBe("Hello everyone,\n\nNeed a tour guide for two days in Chiang Mai?");
  expect(posts[0].groupName).toBe("");
});

// Newer Facebook: a post is a numbered feed item (aria-posinset), not role="article"; comments are role="article".
const modern = (opts: { id: string; text: string; ownLink?: boolean }) => `
  <div><div aria-posinset="1" aria-describedby="x">
    <h3><a href="/groups/111/user/999/">Someone Else</a></h3>
    ${opts.ownLink === false ? `<a href="#">3h</a>` : `<a href="https://www.facebook.com/groups/111/posts/${opts.id}/?__cft__[0]=AZ">3h</a>`}
    <div><div dir="auto"><span>${opts.text}</span></div></div>
    <div role="button">Comment</div>
    <div role="article" aria-label="Comment by Another Person">
      <a href="/groups/111/posts/${opts.id}/?comment_id=555&__cft__[0]=AZ">1h</a>
      <div dir="auto">I used Grab last month, it was fine and cheap enough.</div>
    </div>
  </div></div>`;

test("newer layout: numbered feed items are posts, role=article inside them are comments", async ({ page }) => {
  const posts = await read(page, `<div role="feed">${modern({ id: "4000004", text: "Looking for a private driver from Krabi airport to Ao Nang for 5 people" })}</div>`);
  expect(posts).toHaveLength(1);
  expect(posts[0].url).toContain("/groups/111/posts/4000004/");
  expect(posts[0].text).toBe("Looking for a private driver from Krabi airport to Ao Nang for 5 people");
  expect(JSON.stringify(posts)).not.toContain("Grab");
  expect(JSON.stringify(posts)).not.toContain("Someone Else");
});

test("newer layout: when the post's own link is hidden, the link of one of its comments gives the post", async ({ page }) => {
  const posts = await read(page, `<div role="feed">${modern({ id: "5000005", ownLink: false, text: "Which ferry to Koh Lanta is best with a lot of luggage?" })}</div>`);
  expect(posts.map((p) => p.url)).toEqual(["https://www.facebook.com/groups/111/posts/5000005/"]);
});

test("the page sample for the developer has the structure but no words, names or ids", async ({ page }) => {
  await read(page, `<div role="feed">${modern({ id: "6000006", text: "Secret words about my trip to Phang Nga with Somchai" })}</div>`);
  const sample = await page.evaluate(() => (window as unknown as { WaydidiLeads: { sample: (d: Document) => string } }).WaydidiLeads.sample(document));
  expect(sample).toContain("aria-posinset");
  expect(sample).toContain("href=/groups/N/posts/N/?__cft__[N]");
  expect(sample).toMatch(/\(text \d+\)/);
  for (const secret of ["Secret", "Somchai", "Someone", "Grab", "6000006", "999", "Another Person"]) expect(sample).not.toContain(secret);
});

test("older layout with wrappers: the post is the outermost article inside a feed item; nested articles are comments", async ({ page }) => {
  const posts = await read(page, `<div role="feed"><div><div>${post({ id: "7000007", text: "Need a minivan from Hua Hin to Bangkok airport next Friday, any tips?" })}</div></div></div>`);
  expect(posts).toHaveLength(1);
  expect(posts[0].text).toBe("Need a minivan from Hua Hin to Bangkok airport next Friday, any tips?");
  expect(posts[0].url).toContain("/groups/111/posts/7000007/");
});

// A copy of the real group layout sent by the owner's "Copy page sample" (November 2026): a numbered post, the author's
// name in profile_name, the time as a link with no address ("?__cft__…") until a mouse moves over it, the message in
// story_message ending with a "See more" button, and photo links carrying set=gm.<post>. Made-up content.
const GROUP_PAGE = "https://www.facebook.com/groups/kohchangcommunity/";
const real = (o: { id: string; text?: string; fills?: boolean; photo?: boolean }) => `
  <div><div aria-posinset="1"><div>
    <div><blockquote><span dir="auto"><span>reacted</span></span></blockquote><div role="button"></div></div>
    <div>
      <span><span><span><a role="link" href="/groups/111/user/999/?__cft__[0]=AZ&__tn__=R">avatar</a></span></span></span>
      <div>
        <span dir="ltr"><div data-ad-rendering-role="profile_name"><h2><span><a role="link" href="/groups/111/user/999/?__cft__[0]=AZ&__tn__=R"><b><span>Someone Else</span></b></a></span></h2></div></span>
        <span dir="ltr"><div><span><span><span><a class="ts" ${o.fills === false ? "" : `data-post="${o.id}"`} role="link" href="?__cft__[0]=AZ&__tn__=%2CO%2CP-R"><span><span>2</span><span>h</span></span></a></span></span></span></div></span>
      </div>
    </div>
    <div>${o.text === undefined ? "" : `<div dir="auto"><div data-ad-rendering-role="story_message"><span dir="auto"><span>${o.text}</span> <div role="button">See more</div></span></div></div>`}
      ${o.photo ? `<div><a role="link" href="/photo/?fbid=888&set=gm.${o.id}&idorvanity=111&__cft__[0]=AZ"><img alt=""></a></div>` : ""}
    </div>
  </div></div></div>`;
const realPage = (posts: string) => `<!doctype html><title>Koh Chang Community | Facebook</title><div role="feed">
  <div><div role="button"><div>Sort group feed by</div><h2 dir="auto"><span dir="auto">New posts</span></h2></div></div>${posts}</div>
  <script>document.addEventListener("mouseover", (e) => { const a = e.target.closest && e.target.closest("a.ts"); if (a && a.dataset.post) a.setAttribute("href", "https://www.facebook.com/groups/111/posts/" + a.dataset.post + "/?__cft__[0]=AZ"); }, true);
  window.__clicks = 0; document.addEventListener("click", () => window.__clicks++, true);</script>`;
type Leads = { findPosts: (d: Document) => Post[]; revealLinks: (d: Document) => number; diagnose: (d: Document) => Record<string, number> };
async function openReal(page: import("@playwright/test").Page, posts: string) {
  await page.unroute(GROUP_PAGE).catch(() => undefined);
  await page.route(GROUP_PAGE, (route) => route.fulfill({ contentType: "text/html", body: realPage(posts) }));
  await page.goto(GROUP_PAGE);
  await page.addScriptTag({ path: EXTRACTOR });
}

test("real layout: a hidden time link is revealed by a hover, then the post is read without the See more label", async ({ page }) => {
  await openReal(page, real({ id: "8000008", text: "Looking for a taxi from Trat airport to the Koh Chang ferry for 3 people on Monday" }));
  const before = await page.evaluate(() => { const w = (window as unknown as { WaydidiLeads: Leads }).WaydidiLeads; return { posts: w.findPosts(document), d: w.diagnose(document) }; });
  expect(before.posts).toEqual([]);
  expect(before.d).toMatchObject({ withLink: 0, withText: 1 });
  const after = await page.evaluate(() => { const w = (window as unknown as { WaydidiLeads: Leads }).WaydidiLeads; const n = w.revealLinks(document); return { n, posts: w.findPosts(document) }; });
  expect(after.n).toBe(1);
  expect(after.posts).toHaveLength(1);
  expect(after.posts[0].url).toContain("/groups/111/posts/8000008/");
  expect(after.posts[0].text).toBe("Looking for a taxi from Trat airport to the Koh Chang ferry for 3 people on Monday");
  expect(after.posts[0].groupName).toBe("Koh Chang Community");
  expect(JSON.stringify(after.posts)).not.toContain("Someone Else");
});

test("real layout: revealing only hovers (no click, no focus, no scroll) and hovers each link once", async ({ page }) => {
  await openReal(page, real({ id: "8100008", text: "Which pier is best for the ferry to Koh Chang with a car?" }) + real({ id: "8200008" }));
  const out = await page.evaluate(() => {
    const w = (window as unknown as { WaydidiLeads: Leads; __clicks: number }); const y = scrollY;
    const first = w.WaydidiLeads.revealLinks(document), second = w.WaydidiLeads.revealLinks(document);
    return { first, second, clicks: w.__clicks, focus: document.activeElement === document.body, moved: scrollY !== y };
  });
  expect(out).toEqual({ first: 1, second: 0, clicks: 0, focus: true, moved: false }); // the post with no text is not hovered
});

test("real layout: when hovering does not fill the link, a photo's set=gm.<post> gives the post link", async ({ page }) => {
  await openReal(page, real({ id: "8300008", fills: false, photo: true, text: "Anyone know a good songthaew driver on Koh Chang? Photos of the area" }));
  const posts = await page.evaluate(() => { const w = (window as unknown as { WaydidiLeads: Leads }).WaydidiLeads; w.revealLinks(document); return w.findPosts(document); });
  expect(posts.map((p) => p.url)).toEqual(["https://www.facebook.com/groups/kohchangcommunity/posts/8300008/"]);
});

// Page checks on the copy of the real layout: comments turned off, Waydidi already commented or reacted, "See more".
const unitWith = (id: string, inner: string) => `<div><div aria-posinset="1"><div>
  <span dir="ltr"><div data-ad-rendering-role="profile_name"><h2><a href="/groups/111/user/999/"><span>Someone Else</span></a></h2></div></span>
  <span dir="ltr"><div><a class="ts" href="https://www.facebook.com/groups/111/posts/${id}/">2h</a></div></span>
  ${inner}</div></div></div>`;
const msg = (text: string, seeMore = "") => `<div dir="auto"><div data-ad-rendering-role="story_message"><span dir="auto"><span class="t">${text}</span>${seeMore}</span></div></div>`;
type PageLeads = { findPosts: (d: Document, o?: { names: string[] }) => (Post & { skip?: string })[]; expandPosts: (d: Document) => number };
const leadsOn = (page: import("@playwright/test").Page, names: string[]) =>
  page.evaluate((n) => (window as unknown as { WaydidiLeads: PageLeads }).WaydidiLeads.findPosts(document, { names: n }), names);

test("page checks: comments turned off, a comment by one of our names, or our reaction already pressed", async ({ page }) => {
  await openReal(page, [
    unitWith("9000001", msg("Need a driver from Trat airport tomorrow for 3 people") + `<div><span>The author turned off commenting for this post.</span></div>`),
    unitWith("9000002", msg("Which ferry pier is best for Koh Chang with a car?") + `<div role="article" aria-label="Comment by Waydidi Travel 1 hour ago"><a href="/groups/111/user/1/">Waydidi Travel</a><div dir="auto">The Centrepoint pier is easiest.</div></div>`),
    unitWith("9000003", msg("Any tips for a family day trip to Koh Wai please?") + `<div role="article"><a href="/groups/111/user/2/">Narubordee Naowarat</a><div dir="auto">Go early, the sea is calmer in the morning.</div></div>`),
    unitWith("9000004", msg("Best seafood restaurant near Lonely Beach anyone?") + `<div><div role="button" aria-label="Remove Like"><div data-ad-rendering-role="like_button"></div></div></div>`),
    unitWith("9000005", msg("Looking for a taxi from Koh Chang ferry to Bangkok on Friday") + `<div role="article" aria-label="Comment by Somebody"><a href="/groups/111/user/3/">Somebody</a><div dir="auto">Try the minibus at the pier.</div></div><div><div role="button" aria-label="Like"><div data-ad-rendering-role="like_button"></div></div></div>`),
  ].join(""));
  const posts = await leadsOn(page, ["Waydidi Travel", "Narubordee Naowarat"]);
  expect(posts.map((p) => [p.url.split("/posts/")[1], p.skip ?? ""])).toEqual([
    ["9000001/", "commenting_disabled"], ["9000002/", "already_engaged"], ["9000003/", "already_engaged"], ["9000004/", "already_engaged"], ["9000005/", ""],
  ]);
  expect(JSON.stringify(posts)).not.toMatch(/Waydidi Travel|Narubordee|Somebody|Someone Else/); // names are compared, never sent
  // Without our names, only the page facts count (comments off, reaction pressed).
  expect((await leadsOn(page, [])).map((p) => p.skip ?? "")).toEqual(["commenting_disabled", "", "", "already_engaged", ""]);
});

test('"See more" is tapped once per post (a button in the message, never a link), then the whole post is read', async ({ page }) => {
  await openReal(page, [
    unitWith("9100001", msg("Luxury Private Pool Villas for Yearly Rental", `… <div role="button" class="more">See more</div>`)),
    unitWith("9100002", msg("Need a van from Pattaya to Koh Chang", `… <a href="/groups/111/posts/9100002/" role="button">See more</a>`)),
  ].join("") + `<script>document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest(".more"); if (b) { b.closest("span[dir]").querySelector(".t").textContent += " 📞 Tel +66 64 456 0999 LINE ID: @villas"; b.remove(); } });</script>`);
  const out = await page.evaluate(() => {
    const w = (window as unknown as { WaydidiLeads: PageLeads; __clicks: number });
    const first = w.WaydidiLeads.expandPosts(document), second = w.WaydidiLeads.expandPosts(document);
    return { first, second, url: location.href, posts: w.WaydidiLeads.findPosts(document, { names: [] }) };
  });
  expect([out.first, out.second]).toEqual([1, 0]); // the link-styled "See more" is not tapped; nothing twice
  expect(out.url).toBe(GROUP_PAGE); // nothing opened
  expect(out.posts[0].text).toContain("LINE ID: @villas");
  expect(out.posts[0].text).not.toMatch(/See more\s*$/);
});
