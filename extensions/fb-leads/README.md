# Waydidi Facebook Leads (browser extension)

While you read a Facebook travel group, this extension sends the posts on screen to Waydidi. Waydidi drafts a comment
from the owner's playbook (Admin → Writing assistant) and sends it to the Telegram Comment group: the comment alone,
then the group name, the post link and "Check before posting · <type>" with two buttons, **Posted** and **Skip**
(`lib/telegram/fb-leads.ts`).

While collecting it never comments or likes anything, and it never sends who wrote a post (the reply queue below comments, and likes the post first unless that box is unticked). Facebook hides each post's link (the post's
time is a link with no address), so for each such post the extension tries, up to 3 times: a simulated mouse over the
time, keyboard focus on it (like pressing Tab; no scrolling, focus is given back), and reading the address from the
page's own data (`page-world.js`, which runs inside the Facebook page with no extension permissions, never looks above
the post itself, and only marks the link). For a photo post the photo's link also carries the post number. By default it
only reads what you scroll past. If you press **Collect** it also scrolls the group for you, slowly, like a person
reading, and taps "See more" so it reads whole posts (see below). It works for private groups because it runs in your
own browser, signed in as you, and for **any group you open**, not only one you have already visited. A tab left open
from before the extension's most recent reload has no working copy of these scripts (reloading always breaks the old
one); the popup notices this the moment you press a button there and quietly re-adds them to that tab before trying
again, so you never have to remember to refresh a tab yourself. It is not published in any store; it is loaded from
this folder.

## Install (Chrome or Edge)

1. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
2. Click **Load unpacked** and choose this folder, `extensions/fb-leads`.
3. Click the extension's **Details → Extension options** (or the puzzle icon → Waydidi Facebook Leads → Settings):
   - paste the token (the `FB_LEADS_INGEST_TOKEN` value from Cloudflare);
   - list the **Facebook names Waydidi comments with**, one per line (for example the Waydidi Travel page and the
     staff profiles that comment). Posts where one of them already commented are skipped. The names stay in this
     browser and are never sent.
   Click **Save**, then **Test connection**. It should say "Connected".
4. Open a group on facebook.com, sort it by **New posts**, and scroll as you normally would, or press **Collect**.
   The toolbar icon (the Waydidi bird) shows how many new posts were sent today. A red "!" means a problem: click the
   icon to read it.

After you update the files (for example after pulling a new version), click the reload arrow on the extension card.

## Collect (scrolling for you)

Open a group, sort it by **New posts**, click the extension icon, set **Lead posts to collect** (5 to 100, default 50)
and press **Collect from this group**. Keep that tab in front. It then scrolls the way a person reads: a different
distance each time (about half to four-fifths of a screen), a pause of 2 to 6 seconds on each screen, a longer read of
8 to 15 seconds now and then, and a small scroll back up now and then. Before reading each screen it taps the
**"See more"** button inside each post's text once (owner's choice), so contact details and conditions at the end of a
post are read too. It only taps that button inside the message, never a link, so nothing opens. A run ends by itself:

- when it has your target number of **lead posts**: posts that pass both the word rules and the AI sorter, which the
  website runs the moment a post arrives, so the count matches the comments you get (a few may still be marked
  "Needs your check"). Skipped posts and posts sent before do not count; it scrolls past them. There is **no time
  limit**. A safety stop ends a run that looked at 1,000 posts without reaching the target;
- at the real end of the feed: the page stops moving and stops growing for 3 scrolls in a row. Each time a screen
  looks stuck, it first scrolls decisively to the true bottom and waits a bit longer (3 to 6 seconds, once), in case
  Facebook was just about to load more — only after that still shows nothing does it count against the 3;
- if no post on the page can be read: the popup says so and shows how many posts the page has, how many with a post
  link and how many with text, which tells the developer what changed on Facebook;
- the moment you touch the page (wheel, keys, mouse) or leave the group; switching to another tab for a quick check is
  fine, but it stops if the tab stays hidden for more than 2 minutes at a stretch (Chrome itself slows down, and can
  eventually pause, a tab's own scripts the longer it stays in the background, so a long time away may stall the run
  rather than finish it quickly once you come back);
- if a post cannot be sent (wrong token, website off, no connection).

At this pace a run often takes 20 to 40 minutes: if 1 post in 6 is a lead, 50 leads means looking at about 300 posts.
The AI drafts at most `FB_LEADS_DAILY_LIMIT` posts a day (default 50); extra leads wait for the next day, strongest
first. At most **4 runs a day**; a run that could not read a single post does not count. Press **Stop** in the popup to
end a run early. Scrolling and tapping by script is the part Facebook is most likely to notice, so keep these limits.

## What is collected and what is skipped

Collected: posts where a group member really asks about travel in Thailand: services, recommendations, advice,
transport, tours, hotels, itineraries, island transfers, nightlife, beaches, restaurants or local information. Request
words are checked in English, Thai, Chinese, Russian and Korean. Strong leads (travel dates, a from–to route, a number
of people) are drafted first.

Skipped, with the reason stored for each post (`skip_reason`):

| Reason | What | Checked by |
|---|---|---|
| `commenting_disabled` | the page says comments are turned off | extension, on the page |
| `already_engaged` | a visible comment by one of the names in Settings, or the reaction button is already pressed by the account browsing | extension, on the page |
| `group_admin` | the poster has the group's own "Admin" badge next to their name (English, Thai, Chinese). Not yet confirmed against a real admin post: tell the developer if one slips through or a non-admin post is wrongly skipped | extension, on the page |
| `promo` | adverts, promotions, self-promotion, shops and bars promoting themselves ("we'd like to recommend our…", "we open at…"), invitations ("wanna feel something different", outcall massage), rentals for sale or rent, and any post with contact details (phone, LINE ID, WhatsApp number, wa.me). Exception: a traveller who adds their own number while plainly asking | word rules |
| `long_stay` | a room, condo, house or villa for a month or more ("monthly", "yearly", "รายเดือน", "长租") unless it also asks for transport | word rules |
| `giveaway`, `bait`, `spam` | prize draws, "comment YES / tag a friend", scams, crypto, loans, short links | word rules |
| `solved` | "UPDATE: booked / solved / ได้แล้ว / 已解决" | word rules |
| `admin_post` | group rules and admin announcements | word rules |
| `intro` | a new member saying hello, with no question | word rules |
| `not_served` | jobs, flatmates, lost and found ("lost my sunglasses around…", "anyone found…"), selling personal items, pets, legal or medical emergencies (a driver to a hospital is still a lead) | word rules |
| `missing_person` | a missing person, not a lost item (never a lead, checked first, above every other reason) | word rules |
| `no_request` | no question and no travel word (photos, videos and chat; a photo or video is judged by its caption) | word rules |
| `cross_posted` | the same question already received from another group in the last 7 days | website |
| `advert`, `news`, `giveaway`, `bait`, `meme`, `spam`, `chat` | the AI sorter's type for the post (about US$0.0003, run as soon as the post arrives; also catches what the word rules miss, including a broad "Turkey or Thailand, which is better?" style comparison with no specific Thailand question) | AI sorter |
| `not_thailand` | the AI sorter says the question is clearly about another country | AI sorter |

"No agents, please" posts ("no agents / no sellers / ไม่รับนายหน้า / 不要中介") are kept, but the comment is help only:
no Waydidi offer, no price, no WhatsApp line. Post age is not checked: Facebook hides a post's time the same way it
hides its link, so it cannot be read reliably.

These are word lists and an AI judgement, so a few posts will be kept or skipped wrongly. Tell the developer which
ones; the rules are changed in one place on the server (`lib/fb-leads-rules.ts`), with no change to the extension.

## How the comment is written

The writer (same one as **/c**) is told: never write disclaimer-style lines ("I can't confirm…", "I don't have
[place]-specific data", "I wouldn't rely on…") or suggest the poster ask someone else, a local expat or "the group" —
they are already asking here; speak with the confidence of a real local travel agency staff member instead, and never
repeat the same stock opening ("Your best bet is…", "The trade-off is…") across comments. A hotel or where-to-stay
question also gets its Agoda, Booking.com or Google review rating searched for, as a supporting detail. A question
about booking tours or activities (app/website vs locally) gets real advice first, then Waydidi's private tour as the
easier option. A post asking what to do, for suggestions or for an itinerary (especially over several days or with
family) is treated as a sales opening the same way, even with no booking question attached — "any suggestions of what
to do for 9 days in Phuket with the kids" gets real activity ideas plus Waydidi's tour, not just a helpful answer. The
offer itself is worded differently depending on the ask: a specific point-to-point transfer gets transfer details
(door to door, luggage, stops); anything broader — a multi-day visit, a tour, several places, "what to do" over a trip
— gets offered Waydidi's help to plan and arrange the trip instead, in different words each time, never one fixed
sentence. These are instructions to the AI, not guarantees: wording can still drift, so tell the developer about any
comment that still reads as a disclaimer, repeats a phrase too often, offers the wrong kind of help for what was
actually asked, or misses a lead that should have been treated as one.

## What it sends

For each post that has a link and some text: the post link, the post text, the group name and, when the page showed
it, `commenting_disabled` or `already_engaged`. Nothing else. Each post is sent once; the extension remembers the last
5,000.

## When it stops finding posts

Facebook changes its page markup from time to time. If posts stop arriving while the token test still says "Connected":

1. On the group page, click the extension icon → **Copy page sample for the developer**, and paste it to the developer.
   It is an outline of the first posts on screen: element names, the few attributes the reader uses and link shapes, with
   every word replaced by its length and every number and id replaced by N. No text, names or ids are copied.
2. The developer adds that shape as a new case in `e2e/fb-leads-extractor.spec.ts`, makes it pass in `extractor.js`,
   and you reload the extension.

## Reply queue (you press Post)

Off until the owner sets `FB_LEADS_REPLY_QUEUE_ENABLED=true` on the website. Click the extension icon → **Start replying**:

1. The next drafted lead (ready to post, strongest and newest first) opens in a new tab.
2. The draft is put in the post's comment box, and a small **Waydidi** bar appears at the bottom right.
3. Read it, change it if needed, then press **Post on Facebook yourself**. The extension never presses Post, Enter or any
   Facebook button.
4. When your comment appears (a new comment by one of the names in Settings, or one that starts with the same words as
   the draft, whatever Facebook name you post from), the lead is marked **Posted** and a "Posted on Facebook" message
   is sent in Telegram as a reply to the lead,
   the tab closes, and the next lead opens after the pause between comments. You can also tap **Posted** or **Skip** in
   the bar (for example if your name in Settings is spelled differently on Facebook).
5. **Stop queue** in the bar or **Stop** in the popup ends it. Closing a reply tab yourself hands that lead back and
   pauses the queue.

The Telegram link message also has an **Open in Chrome** button: open it in the browser that has this extension and the
same bar appears for that one lead.

The website holds the limits for every browser together: at most `FB_LEADS_REPLY_DAILY_CAP` comments a day (default 30;
Posted taps in Telegram count too) and `FB_LEADS_REPLY_GAP_MIN` minutes between two comments (default 3, plus a random
extra 20 to 90 seconds in the extension). Many similar comments in a short time is what Facebook flags as spam,
whoever presses Post, so keep these limits low and stop if Facebook warns the account.

If the comment box is not found (comments turned off, or Facebook changed the page), the bar offers **Copy draft**.

## Like first, page tag and QR picture

**Like the post first** (popup, ticked by default): when a reply tab opens, the post's own Like button is pressed the
way a mouse does (never a comment's Like), and the comment is put in 5 to 12 seconds later, at random. A post that is
already liked is not pressed again. Untick the box to comment without liking.

After the draft is in the comment box, and before anything else happens:

- **Page tag.** The first of the names in Settings that appears in the comment (normally "Waydidi Travel") becomes a
  real Facebook tag, the way a person does it: the name is replaced by "@Waydidi Travel" and Facebook's matching
  suggestion is pressed the way a mouse does (Tab is tried next while the list is open; never Enter). It counts as
  tagged only once the "@" is gone. If Facebook shows no suggestion, or does not take the choice, the plain name is put
  back and the bar says so. The comment is still sent as usual.
- **QR picture.** A sales comment (one with "WhatsApp" and a phone number) gets the QR picture chosen in Settings →
  **QR picture for sales comments**, for example `Waydidi Resource\Waydidi_QR.jpg`. Pick it once; it is kept only in
  this browser. If none is saved yet, the bar on the first sales comment has a **Choose QR picture** button that saves
  it and adds it at once. The picture is given to the comment's own photo button (or pasted into the box), and the extension waits
  up to 10 seconds for Facebook's preview.

If a sales comment has no QR picture (none set in Settings, or Facebook showed no preview), Chrome **never sends it**,
even with Send from Telegram: the bar asks you to add the picture and press Post yourself. Neither step presses Post.

If the Like, the tag or the QR picture does not work on a real post, press **Copy details** in the Waydidi bar and paste it
to the developer: it holds the results, the Like buttons it saw (labels and pressed state), the shape of the comment box
and the file inputs near it. No post text, comment text or names.

## Send from Telegram (ส่ง Comment, the extension presses send)

Off until the owner sets `FB_LEADS_AUTO_POST_ENABLED=true` (the reply queue must be on too).

1. In the popup, tick **Send from Telegram (ส่ง Comment)**, then press **Start replying**. Keep this browser open and
   signed in to the Facebook account that comments.
2. The next lead opens and the draft is put in the comment box, as in the reply queue.
3. The Comment group in Telegram gets a message under that lead: "วางคอมเมนต์ใน Chrome แล้ว รอส่ง", the comment, and
   two buttons, **ส่ง Comment** and **ข้าม**. Only people on the Waydidi Telegram team can use ส่ง Comment.
4. When someone taps **ส่ง Comment**, Chrome waits **15 seconds** and presses Facebook's send button (or Enter in the
   comment box).
5. Once the comment shows on the page, the same Telegram message changes to "โพสต์บน Facebook แล้ว", the tab closes, and
   the next lead opens after the pause between comments.

While it waits you can still press Post on Facebook yourself. **ข้าม** in Telegram closes the tab and moves on. If
Chrome cannot send after the tap (the comment does not appear within 30 seconds, you close the tab or press Stop), the
message changes to "Chrome ส่งคอมเมนต์ไม่ได้ กรุณาโพสต์เอง" and nothing is retried. Closing the tab before the tap hands
the lead back to the queue. It never posts the same comment twice: if a Waydidi comment, or one with the same words, is
already on the post, it is only marked Posted. The daily cap and the gap between comments still apply.

This is the part of the extension Facebook is most likely to notice: a script pressing send. Tap ส่ง Comment only for
comments you have read, keep the cap low, and untick the box if Facebook warns the account.

## Limits

- It collects only while a group page is open in the browser, and only the posts that were rendered on screen.
- While you browse yourself (no Collect run), "See more" is not tapped, so only the visible part of a long post is read.
- "Already engaged" sees only comments shown on the page (not those behind "View more comments"), and a reaction only
  when you browse with the account that reacted.
- Automated collection is against Facebook's terms, and scrolling and tapping by script are easier to notice than
  reading alone. The human pace and the limits above lower the risk; they do not remove it. Facebook may ask you to
  confirm it is you, or limit the account. Use an account you can afford to have checked, and stop if it asks.
- Memory use is tiny (a script on the Facebook tab and one idle background worker).
