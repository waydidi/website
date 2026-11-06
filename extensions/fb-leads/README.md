# Waydidi Facebook Leads (browser extension)

While you read a Facebook travel group, this extension sends the posts on screen to Waydidi. Waydidi drafts a comment
from the owner's playbook (Admin → Writing assistant) and sends it to the Telegram Comment group, with the post link and
✅ Posted / ⏭ Skip buttons (`lib/telegram/fb-leads.ts`).

It never clicks, comments or likes anything, and it never reads who wrote a post. By default it only reads what you
scroll past. If you press **Collect** it also scrolls the group for you, slowly, like a person reading (see below). It
works for private groups because it runs in your own browser, signed in as you. It is not published in any store; it is
loaded from this folder.

## Install (Chrome or Edge)

1. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder, `extensions/fb-leads`.
3. Click the extension's **Details → Extension options** (or the puzzle icon → Waydidi Facebook Leads → Settings),
   paste the token (the `FB_LEADS_INGEST_TOKEN` value from Cloudflare), click **Save**, then **Test connection**.
   It should say "Connected".
4. Open a group on facebook.com, sort it by **New posts**, and scroll as you normally would, or press **Collect**.
   The toolbar icon shows how many new posts were sent today. A red "!" means a problem: click the icon to read it.

After you update the files (for example after pulling a new version), click the reload arrow on the extension card.

## Collect (scrolling for you)

Open a group, sort it by **New posts**, click the extension icon and press **Collect from this group**. Keep that tab
in front. It then scrolls the way a person reads: a different distance each time (about half to four-fifths of a
screen), a pause of 3 to 9 seconds on each screen, a longer read of 12 to 25 seconds now and then, and a small scroll
back up now and then. A run is limited and always ends by itself:

- after 30 posts that look like requests, or 150 posts looked at, or 12 minutes;
- at the end of the feed (5 screens in a row with nothing new);
- the moment you touch the page (wheel, keys, mouse), switch to another tab or leave the group;
- if a post cannot be sent (wrong token, website off, no connection).

At most **4 runs a day**. It never clicks "See more", never opens a post and never types. Press **Stop** in the popup to
end a run early. Scrolling by script is the part Facebook is most likely to notice, so keep these limits; do not raise
them without thinking about the Facebook account used.

## What is left out

The server drops these before any AI is used, so they cost nothing and send no message (`screenPost` in
`lib/fb-leads-rules.ts`):

- **Adverts and promotions** by other businesses ("book now", "special price", "contact us", "we offer…", a phone or
  LINE contact next to a price, and the same in Thai and Chinese), unless the post is plainly someone asking.
  Facebook's own sponsored posts have no group post link, so the extension never picks them up.
- **Long stays**: a room, condo, house or accommodation wanted for a month or more ("3 months", "monthly",
  "long term", "รายเดือน", "长租"). A post that also asks for a driver, transfer, car or tour is kept.
- **Posts that ask for nothing**: photos, videos and chat with no question and no travel word. The extension reads text
  only, never the pictures or videos themselves, so a photo or video is judged by its caption alone.

These are word lists, not understanding, so a few posts will be kept or dropped wrongly. Tell the developer which ones
and the lists are changed in one place on the server, with no change to the extension.

## What it sends

For each post that has a link and some text: the post link, the post text and the group name. Nothing else.
Each post is sent once; the extension remembers the last 5,000.

## When it stops finding posts

Facebook changes its page markup from time to time. If posts stop arriving while the token test still says "Connected":

1. Copy the markup of one post (right-click the post → Inspect → copy outer HTML) with names removed.
2. Add it as a new case in `e2e/fb-leads-extractor.spec.ts`, make it pass in `extractor.js`, and reload the extension.

## Limits

- It collects only while a group page is open in the browser, and only the posts that were rendered on screen.
- A long post shows "See more" on Facebook; only the visible part is read, so its comment may miss detail.
- Automated collection is against Facebook's terms, and scrolling by script is easier to notice than reading alone.
  The human pace and the limits above lower the risk; they do not remove it. Facebook may ask you to confirm it is you,
  or limit the account. Use an account you can afford to have checked, and stop if it asks.
- Memory use is tiny (a script on the Facebook tab and one idle background worker).
