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
