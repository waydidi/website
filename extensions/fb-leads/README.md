# Waydidi Facebook Leads (browser extension)

While you read a Facebook travel group, this extension sends the posts on screen to Waydidi. Waydidi drafts a comment
from the owner's playbook (Admin → Writing assistant) and sends it to the Telegram Comment group, with the post link and
✅ Posted / ⏭ Skip buttons (`lib/telegram/fb-leads.ts`).

It only reads. It does not scroll, click, comment or like anything, and it never reads who wrote a post. It works for
private groups because it runs in your own browser, signed in as you. It is not published in any store; it is loaded from
this folder.

## Install (Chrome or Edge)

1. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder, `extensions/fb-leads`.
3. Click the extension's **Details → Extension options** (or the puzzle icon → Waydidi Facebook Leads → Settings),
   paste the token (the `FB_LEADS_INGEST_TOKEN` value from Cloudflare), click **Save**, then **Test connection**.
   It should say "Connected".
4. Open a group on facebook.com, sort it by **New posts**, and scroll as you normally would.
   The toolbar icon shows how many new posts were sent today. A red "!" means a problem: click the icon to read it.

After you update the files (for example after pulling a new version), click the reload arrow on the extension card.

## What it sends

For each post that has a link and some text: the post link, the post text and the group name. Nothing else.
The server ignores posts that do not ask or need anything (photos, chat), so they cost nothing. Each post is sent once;
the extension remembers the last 5,000.

## When it stops finding posts

Facebook changes its page markup from time to time. If posts stop arriving while the token test still says "Connected":

1. Copy the markup of one post (right-click the post → Inspect → copy outer HTML) with names removed.
2. Add it as a new case in `e2e/fb-leads-extractor.spec.ts`, make it pass in `extractor.js`, and reload the extension.

## Limits

- It collects only while a group page is open in the browser, and only the posts that were rendered on screen.
- A long post shows "See more" on Facebook; only the visible part is read, so its comment may miss detail.
- Automated collection is against Facebook's terms. Passive reading in your own session is the lowest-risk way, but
  the risk is not zero. Do not add automatic scrolling or clicking.
- Memory use is tiny (a script on the Facebook tab and one idle background worker).
