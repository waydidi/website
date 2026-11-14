# Facebook leads reply queue: release

The browser extension opens drafted leads one at a time, puts the comment in Facebook's comment box, and a person
checks it and presses Post. Nothing is posted by code. See `extensions/fb-leads/README.md` → "Reply queue".

## Before turning it on

- Facebook leads already works (`FB_LEADS_ENABLED=true`, drafts arrive in the Telegram Comment group).
- The extension's Settings list the exact Facebook names the team comments with (used to notice a posted comment).

## Worker variables (Cloudflare → Workers → waydidi → Settings → Variables)

| Variable | Value | Notes |
|---|---|---|
| `FB_LEADS_REPLY_QUEUE_ENABLED` | `true` | Off when empty. Turning it off hides the Open in Chrome button and the endpoint answers 404. |
| `FB_LEADS_REPLY_DAILY_CAP` | `30` (1 to 100) | Comments posted per Thailand day, all browsers and Telegram Posted taps together. Start low (10 to 20) for the first week. |
| `FB_LEADS_REPLY_GAP_MIN` | `3` (1 to 60) | Minutes between two posted comments. |
| `FB_LEADS_AUTO_POST_ENABLED` | empty, later `true` | Send from Telegram: after the draft is in Chrome, a message under the lead with **ส่ง Comment**; Chrome presses send 15 seconds after the tap. Turn on only after the manual queue has run for a few days. |

No new Secret: the extension uses the existing `FB_LEADS_INGEST_TOKEN`.

## Database

`drizzle/0123_fb_leads_reply_queue.sql` (three columns, one index). The Worker adds them on first use, so no manual step.

## Rolling out the extension

1. Pull the new version, open `chrome://extensions`, click the reload arrow on **Waydidi Facebook Leads** (version 1.4.0).
   Chrome asks nothing new except the alarms permission, which needs no prompt.
2. Click the icon → **Start replying**. A post opens with the draft in the comment box and the Waydidi bar.
3. Post one comment by hand and check that the tab closes by itself and Telegram shows "Posted by Chrome extension".
   If the tab does not close, the name in Settings does not match the commenting account: fix it, or use the bar's
   Posted button.

## Send from Telegram

1. Set `FB_LEADS_AUTO_POST_ENABLED=true`.
2. In one browser that stays open, tick **Send from Telegram (ส่ง Comment)** in the extension popup (version 1.5.0), then
   press **Start replying**.
3. In Telegram, a message "วางคอมเมนต์ใน Chrome แล้ว รอส่ง" appears under the lead. Tap **ส่ง Comment**. 15 seconds later
   the comment is sent, the message changes to "โพสต์บน Facebook แล้ว", the tab closes and the next lead opens.
4. If the message instead says "Chrome ส่งคอมเมนต์ไม่ได้", Facebook's page differs from the tested shape: post it by hand,
   untick the box, and send the developer a page sample (popup → Copy page sample).

Database: `drizzle/0124_fb_leads_send_from_telegram.sql` adds one column (`ready_message_id`); the Worker adds it on first use.

## Turning it off

Set `FB_LEADS_REPLY_QUEUE_ENABLED` to empty. Set `FB_LEADS_AUTO_POST_ENABLED` to empty to stop posting from Telegram alone; approved comments not yet posted then stay unposted. Open tabs keep their draft, but nothing new is handed out.

## Risk

Facebook treats many similar comments in a short time as spam, whoever presses Post. Keep the cap low, keep the
comments specific to each post (the writer already does), and stop if Facebook warns or limits the account.
