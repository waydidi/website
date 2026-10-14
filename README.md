# Waydidi Travel

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Production deployment

Waydidi’s only live site is [https://waydidi.com](https://waydidi.com). GitHub `main` is the source for the Cloudflare Worker `waydidi-website`. Use Cloudflare Workers Builds for deployment; pushing a review branch alone does not publish it. Keep `WAYDIDI_PUBLIC_URL` in the Worker settings equal to this origin. Do not publish this repository to the former ChatGPT Sites address.

Canonical URLs, structured data, sitemap and robots metadata use `lib/site.ts`. The historical `.openai/hosting.json` is retained for build compatibility and logical bindings; it is not a deployment target.

## Receipt PDF documents

After a payment is recorded, **Account → Receipts → Receipt PDF** downloads a separate financial document; **Booking confirmation** retains the original trip PDF. **Admin → Financials → Payments → Receipt PDF** is available to owner/finance staff. The authenticated endpoints are `/api/account/trips/:reference/receipt` and `/api/admin/payments/:reference/receipt`; customer ownership and finance roles are checked server-side.

The first authorized, payment-eligible download safely creates the additive receipt table/index if needed, then saves an immutable document number, issue timestamp, issuer/customer billing snapshot and financial breakdown. `drizzle/0099_booking_receipt_documents.sql` is idempotent and can also be applied through normal D1 migrations. Concurrent downloads of the same cumulative financial state return the same document number. Additional collections/refunds create a new cumulative receipt snapshot, not another charge; older snapshots stay in the database. There is no public receipt URL, automatic receipt-email send, or credit-note issuance in this feature.

Receipts use recorded integer-satang amounts, inclusive booking totals, add-ons/discounts, overtime collection, refunds and outstanding balances. Confirmed-but-unpaid cash bookings, zero recorded payments, test payments, inconsistent amounts and disputes cannot issue receipts. A receipt acknowledges recorded collection rather than merely the booking's status.

Optional Worker variables (do not put real personal/company tax details in source):

- `WAYDIDI_RECEIPT_ISSUER_NAME`: legal issuer/trading name (default `Waydidi Travel`).
- `WAYDIDI_RECEIPT_ISSUER_ADDRESS`: issuer address.
- `WAYDIDI_RECEIPT_ISSUER_TAX_ID`: 13-digit issuer tax ID.
- `WAYDIDI_RECEIPT_ISSUER_BRANCH`: branch (default `Head office`).
- `WAYDIDI_RECEIPT_VAT_REGISTERED`: defaults off; only `1` enables tax-invoice eligibility.
- `WAYDIDI_RECEIPT_VAT_BPS`: inclusive VAT rate in basis points (default `700`, i.e. 7%).

The tax-invoice title is used only with complete enabled issuer settings, complete requested customer tax/address details, full recorded payment and no refunds. VAT is split out of the already charged total, never added to the booking charge. Otherwise the PDF is a receipt, not a VAT tax invoice. Enabling VAT with incomplete issuer details fails closed. The issuer's eligibility and correct rate must be verified by the operator before enabling this setting. Existing documents retain their original snapshot even if customer/issuer details change later.

The receipt reuses the confirmation's orange header/logo and pale-orange totals, includes quantity/unit-price/item totals and signature/date spaces, and bundles licensed Noto Sans Thai for Thai/Latin text without a runtime font fetch. Test with `node --test tests/receipt-pdf.test.mjs`.

## Telegram website chat

Website chat is one conversation stored in D1 and shown in three places: the customer's chat window, **Admin → Website chat**, and a Telegram staff group. Customer messages are saved first and then posted to Telegram as a card (customer, page, status, latest message) with buttons (Assign to me, Reply, Pending, Close, Open in Admin). Staff answer by replying to the card, a mirrored message or a "Reply" prompt. Status and assignment changes edit the original card instead of posting new ones. New bookings also get a Telegram card.

Owner setup:

1. Create a bot with `@BotFather` (`/newbot`), add it to your private staff group, and get the group's numeric chat ID (negative for groups).
2. In the Cloudflare Worker `waydidi-website`, add secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `TELEGRAM_WEBHOOK_SECRET` (16–256 letters, numbers, `_` or `-`). Never commit them.
3. Open **Admin → Website chat → Telegram team**, press **Connect webhook** (registers `/api/integrations/telegram/webhook` with the secret header; `/api/webhooks/telegram` is an alias), then **Send test message**.
4. Each staff member sends `/id` in the group; add their numeric ID and the name customers should see. Only these approved, enabled people can reply, assign or close from Telegram.

**Job lookup:** a team member types `assignment Tayla`, `Give me assignment for Tayla`, `ขอ ใบงาน Tayla` or `/job FMBNUW` in the staff group; `Give me Tayla ref id`, `ref for Tayla` or `ขอ เลขจอง Tayla` work too. The bot replies with the driver job message (the same as Admin → "Send job to Telegram") for each upcoming booking matching the customer name (nearest first, up to 5), or for that exact reference. It only reads; nothing is assigned or sent to customers. Plain messages reach the bot only when its group privacy is off (@BotFather → `/setprivacy` → Disable) or it is a group admin; `/job …` always works.

**Team assistant:** any other message a team member writes in the staff group (English or Thai) is answered by Claude Haiku 5.5 (`claude-haiku-5-5`, the low-cost model) using read-only lookups over Waydidi's own data: bookings, the schedule and assigned drivers, drivers, customer chats, payments, revenue, live prices from the price tables, packages, the Non knowledge notes, and the policy files (vehicles, refund policy, add-ons, member tiers, loyalty, contact). It answers only from what those lookups return. Waydidi has one admin, so everyone on the Telegram team list (Admin → Chat → Telegram team) asks with full owner access: bookings, customers, drivers, payments and driver costs. Keep only yourself on that list. It cannot change anything or message customers. Reply to one of its answers to ask a follow-up. Job requests (`assignment Tayla`, `ใบงาน QCHDGW`) still use the instant lookup above. The job message (ใบงาน) is: the booking reference; the car (`อัลติส+ 🚗`, `SUV 🚗` or `ตู้สวย 🚗`); customer name; passengers and bags; date; time; pickup and drop-off, each followed by its Google Maps link (directions to the address, or a Google Maps link saved earlier for that booking); and the driver cost (`ราคา`, `-` until set). Admin → Send job to Telegram and the assistant use the same message. Settings: `TELEGRAM_ASSISTANT=0` turns it off; `TELEGRAM_ASSISTANT_MONTHLY_USD` caps spending (default US$20 a month; usage is kept in `app_settings` under `tg_assistant_usage:YYYY-MM` and shown in Admin → Chat → Non knowledge as "Telegram assistant spend this month").


**Booking card buttons (team group):** before anyone takes a booking: **Assign to me** and **Open booking**; after: **Set cost** (until the cost is set) and **Open booking**. Drivers take jobs in the driver group below.

**Driver group (off by default):** a second Telegram group for drivers and fleet owners. A booking is posted there in Thai as soon as staff set its driver cost (with the card's **Set cost** button, or many at once, below): `SUV งานใหม่🚗` (the car), then วันที่, เวลา, รับ, ส่ง (or hours), จำนวน, the return date if any, and ค่างาน (the driver cost). No booking reference or payment line. A booking without a cost is never shown to drivers, and the customer's name, phone, email and flight never appear in the group. **The first driver to tap ✋ รับงาน (Assign) gets the job**: one guarded write decides who was first, and anyone tapping later sees "มีคนรับงานนี้แล้ว". The post changes at once to the taken layout, with no button: `🚗 งาน Ref ID: REF`, รถ, วันที่, เวลา, รับ, ส่ง, จำนวน, ค่างาน, then only **งานชำระแล้ว** or **งานเงินสด** (no amounts: the cash to collect is in the private ใบงาน) and `✅ รับงานแล้ว: name`. The bot also checks with Telegram that the tapper is a member of the driver group. The next step is in the driver's private chat with the bot (Telegram opens it for someone who has never used the bot; the same link also stays under the job in the group as a **▶️ เริ่มแชทกับบอทเพื่อรับงาน** button, because a bot cannot message a person who has never started it and the pop-up is easy to miss), within 30 minutes:
- **A driver who has signed up before** picks the car from two buttons: `«car» — «plate»` (their saved car, shown as `รถของฉัน — «plate»`) or `รถอื่นๆ`. **รถอื่นๆ** asks the same four questions as a first-time driver (below): it is another driver and car (for example a fleet owner sending another of their drivers), saved as a new driver record and linked to that Telegram account from then on. Neither the car's model nor its type is asked; the plate and the car photo identify it. The driving licence and Thai ID card are not asked either.
- **A first-time driver** answers four questions: name (the bot requires both a first name and a last name, at least two words of two or more characters, e.g. สมชาย ใจดี), phone, plate and a photo of the car (no licence or ID card). They are saved as an outsourced driver (photos in private storage) and linked to that Telegram account.

Then the job is assigned. The team group gets a short line, "รถทะเบียน «plate» รับงาน «REF» ✅", then the job: "✋ «plate» รับงานจากกลุ่มคนขับ" (with a warning if the phone matches another driver), the car, customer name, passengers and bags, วันที่, เวลา, ไฟลท์, รับ, ส่ง, ราคา (the driver cost, with the cash to collect in brackets), คนขับ, เบอร์, รถ, ทะเบียน and the trip link. Every time a driver takes a job, their documents are posted under the booking card for checking: the car photo from their driver record (and a licence/ID photo only if staff added one in Admin → Drivers), with name, phone, car and plate (🪪 เอกสารคนขับใหม่ for a first-time driver, 🪪 เอกสารคนขับ (เปลี่ยนรถ) after รถอื่นๆ, 🪪 เอกสารคนขับ for the saved car). A driver with no photos on file is flagged (⚠️ ไม่มีรูปเอกสารในระบบ). The photos stay in private storage and in Admin → Drivers. The driver gets the ใบงาน privately (the job message above, with Google Maps links), plus the cash to collect and their trip link. If they don't finish in 30 minutes, or tap «ยกเลิกการรับงาน», the job is offered to the group again (checked every minute). A driver set by staff in the team group always wins. Stand by / Pick up / Drop photos are posted in both groups (the Completed job button stays in the team group), and the Completed job message, whether the driver's photos complete the job or staff tap Completed job, is posted in both groups with the same text: reference, route, date and time only, never the driver's name, phone, plate or car. In the driver group or privately, **งานของฉัน** sends the driver their upcoming jobs and links privately. The AI assistant never answers in the driver group. **South of Thailand group (optional):** create a second group the same way, send `/chatid` there and set `TELEGRAM_DRIVER_CHAT_ID_SOUTH` (it must differ from the other two). A job whose **pickup** names a place in the south (Phuket, Krabi, Phang Nga/Khao Lak, Surat Thani/Samui/Phangan/Tao, Nakhon Si Thammarat, Chumphon, Ranong, Trang, Satun, Songkhla/Hat Yai, Pattani, Yala, Narathiwat; English or Thai) is offered **only** in the south group, every other job only in the main group. The group a job was offered in is saved with it (`telegram_driver_job_chats`), its updates and the trip photos go there, and only a member of that group can take it. Without the variable everything stays in the main group. Setup: create the group, add the bot (Group Privacy off, as for the team group), send `/chatid` there, then set `TELEGRAM_DRIVER_CHAT_ID` to that ID and `TELEGRAM_DRIVER_JOBS=1` in the Worker. A booking made before it was turned on is offered when its cost is next set.

**Driver costs for many bookings at once:** in the team group, send «ราคา» (or `cost`, `/cost`) followed by one booking reference and driver cost in THB per line, up to 20:

```
ราคา
FMBNUW 1800
52LLDS 2,200
```

Each cost is saved exactly as with **Set cost** (an unassigned card is taken by the sender), the driver job is posted if a driver was already set, and every booking that still needs a driver goes to the driver group, earliest pickup first. The bot replies with one line per booking (✓ posted, or ✗ not found / unreadable). Sending a cost again updates the price on the driver group post instead of posting it twice.

Updates are de-duplicated by `update_id`, the webhook secret is checked on every call, callbacks are re-validated server side, and replies are routed only by stored Telegram message ids, never by name. Failed Telegram deliveries keep the customer's message and are retried by the five-minute cron. The schema is in `drizzle/0069_chat_telegram.sql`.


### Editing a booking that already has a driver

When staff edit a booking in Admin (details, or its payment) or approve a customer's change, and a driver already has the job, the driver is **not** told straight away. The Admin group gets an **แก้ไขการจอง** card with the booking, the change and the current driver. **Assign to me** shows two choices:

- **คนขับปัจจุบัน**: the Waydidi bot sends the updated ใบงาน to the driver who has the job (new trip link; the old one stops working).
- **คนขับใหม่**: the current driver loses the job (link revoked, told privately), the post in the driver group says "กำลังหาคนขับใหม่", the old driver cost is cleared (unless already paid) and the Admin group is asked for a new cost. Once it is set, the job is offered to the driver group (or the south group) again as for a new booking.

Only one person's tap counts. A second edit before anyone answers replaces the first card. A booking with no driver is only redrawn (an offer still in the driver group updates itself).

### Admin links opened from Telegram

The staff cookie is `SameSite=Strict`, so a link tapped outside the site (Telegram's **Open booking**) used to arrive without it and showed `{"error":"Staff sign-in required."}` even for a signed-in person. A staff page or API address opened as a page visit without the cookie now goes through one hop (a small page on waydidi.com that reloads the same address, which sends the cookie). Still no session after the hop: the sign-in page. Fetches and API calls keep the plain 401, and the cookie rule is unchanged (`lib/admin-gate.ts`, `worker/index.ts`).

## Driver bank details after the Drop

When a driver confirms the Drop on their trip link (`/driver/trip/…`), the link goes to **กรอกข้อมูลบัญชี** instead of the trip page: **ธนาคาร** (a bottom sheet listing the Thai banks, like the date and time picker), **เลขที่บัญชี** (8–16 digits) and **ชื่อบัญชี**, which is filled in with the assigned driver's name and **must match it** (titles such as นาย/นาง/นางสาว, spaces and capitals are ignored). **ส่งข้อมูล** shows the same tick as a finished website booking (the account number partly hidden, with **เสร็จสิ้น** to go back to the trip page and **แก้ไขข้อมูลบัญชี** to change it). A driver who already sent the details for that job goes straight to the trip page, and so does a **cash** job: only prepaid bookings ask for bank details (the request is refused with 409 for cash).

The request (`POST /api/driver/bank`) needs the driver link's token like every driver request, only works once the Drop is done, and only changes the driver that link belongs to. The details are saved with the job (`driver_payout_details`) and replace the driver's saved account (used in the payout message). The Admin group gets "💳 ข้อมูลบัญชีคนขับ" with the bank, the full account number (tap to copy) and the account name; if the account differs from the one saved before, a ⚠️ line shows the old one partly hidden, so a wrong or fraudulent change is seen before paying. Sending the same details again (a retry) saves and announces once. Account numbers are never logged. No Worker variables.

## Non (chat assistant) on website, WhatsApp and LINE

Non answers customer chats instantly, quoting only from the site's price tables and searching the notes under **Admin → Chat → Non knowledge** (plus the attraction database). It hands over to staff (with a Telegram alert) when it can't help. Secrets go in Cloudflare (Workers → Settings → Variables and secrets), never in the code:

- `ANTHROPIC_API_KEY` turns Non on. `GOOGLE_MAPS_SERVER_KEY` is needed for route prices.
- **WhatsApp** (Meta WhatsApp Cloud API): `WHATSAPP_TOKEN` (permanent system-user token), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, and `WHATSAPP_VERIFY_TOKEN` (any long random text). In the Meta app's WhatsApp → Configuration, set the callback URL to `https://<your domain>/api/integrations/whatsapp/webhook` with the same verify token and subscribe to `messages`. Staff can reply free-form only within 24 hours of the customer's last message (WhatsApp's rule).
- **LINE** (LINE Official Account → Messaging API): `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_CHANNEL_SECRET`. Set the webhook URL to `https://<your domain>/api/integrations/line/webhook`, turn "Use webhook" on and LINE's own auto-reply off. Replies use push messages, which count against the LINE plan's monthly message quota.
- Model and monthly cost are on the Non knowledge tab. `ANTHROPIC_API_KEY=... node scripts/cee-eval.mjs` runs the 100 test questions against the real model (costs real money) and writes `cee-eval-report.md` with answers, timings and cost.

## Waydidi in LINE (LIFF)

`/liff` is My Trips inside the LINE app. The page loads LINE's LIFF SDK, gets an ID token, and `POST /api/liff/session` verifies it with LINE (`api.line.me/oauth2/v2.1/verify`, audience = the LIFF app's channel) before creating the normal customer session. The customer is found by their linked LINE identity, or by the verified email LINE shares. If LINE shares no email, the customer signs in once by email code and their LINE account is then linked, so later visits sign in automatically. `/liff/trips` lists their trips; trip details, slips and receipts are the normal account pages.

Owner setup: in LINE Developers, on the same LINE Login channel used for social sign-in, add a LIFF app (size Full, Endpoint URL `https://waydidi.com/liff`, scopes `openid profile email`). Put its LIFF ID in the Worker variable `LINE_LIFF_ID`. Link `https://liff.line.me/<LIFF ID>` from the LINE Official Account rich menu. The LIFF SDK is allowed by the Content Security Policy on `/liff` pages only.

## Bank transfer / PromptPay slips

Customers with a pay-later (cash) booking can upload a transfer slip on **Account → My trips → trip**. Claude (`claude-opus-5-5`, vision with structured output) reads the amount, date, receiver, account and bank reference; `lib/payment-slip-rules.ts` decides in code. A slip is approved without a person only when `WAYDIDI_SLIP_AUTO_APPROVE=1` **and** it is clearly a slip, read with high confidence, for exactly the balance due, to a configured payee name and account, dated between the booking and now, with no signs of editing, and neither the image nor the bank reference was used before. Everything else waits in **Admin → Payments → Transfer slips** (owner/finance), with the reasons listed and a Telegram alert. Rejections need a reason, which the customer sees.

An approval is a cash receipt (`cash_receipts` id `slip:<slip id>`) written in one D1 batch with the existing cash-collection guard: it is recorded once, never above the booking total, never for a slip that was just rejected, and one bank reference can be approved only once. Receipts PDFs therefore include it. Slip images are private (R2 or the D1 file store) and served only to owner/finance.

Worker variables: `WAYDIDI_SLIP_PAYEE_NAMES` (turns the feature on), `WAYDIDI_SLIP_PAYEE_ACCOUNTS`, `WAYDIDI_SLIP_PAYEE_DISPLAY`, `WAYDIDI_SLIP_AUTO_APPROVE` (default off) and `ANTHROPIC_API_KEY` (without it every slip goes to review). The table is created on first use and by `drizzle/0102_payment_slips.sql`. Test with `node --test tests/payment-slips.test.mjs tests/liff.test.mjs`.

**Waiting for payment (Admin → Bookings → Create booking):** the payment choice is Paid, Pay in cash or Waiting for payment. Waiting for payment saves payment method `transfer`: the customer pays by bank transfer or PromptPay before the trip, the driver's job message says not to collect cash, emails and PDFs say "Waiting for payment (bank transfer)", and the booking shows under Admin → Payments → "Cash or transfer to collect" with a **Record transfer** button. The customer can also upload a slip on their booking. Transfers use the same cash-receipt ledger as cash (`lib/cash-collection.ts`); a part payment stays waiting and never becomes cash for the driver. Payment method rules live in `lib/payment-methods.ts`.

**Edit booking (Admin → Bookings → Edit):** besides the trip (route, date and time, car, passengers and bags), staff can change the customer's name, surname, phone and email, the flight number, child seats and notes; the price never changes and a driver who has the job gets the updated job in Telegram. **Payment** can be switched between Pay in cash and Waiting for payment by anyone who edits bookings; choosing **Paid** records the remaining balance in the cash-receipt ledger and is limited to owner and finance. Card payments and bookings already paid in full can't be changed here (refunds stay in Payments). Rules: `lib/booking-edit.ts`; endpoint `POST /api/admin/bookings/:reference/payment`.

**LINE quick book:** when pricing a filled customer form in LINE, each suggested price has a cash and a โอน (transfer) button; a typed price books cash (`3400`) or waiting for transfer (`3400 โอน`, `3400 transfer`). Rules: `lib/quick-book-rules.ts`.

## Design system (G7)

Tokens and rules are in [`docs/design-system-g7.md`](docs/design-system-g7.md); the values live in `app/globals.css`.

## Starter build tooling

Install locked dependencies with `npm run install:ci`, then build with `npm run build`. Cloudflare deploys the built Worker using the configuration generated from `vite.config.ts`.

This starter does not use `wrangler.jsonc`.

`install:ci` is intentionally a single, non-retrying `npm ci`. It refuses a concurrent install for the same project, consumes a matching image-seeded npm cache with `--prefer-offline` while retaining registry fallback for a missing cache object, otherwise downloads and verifies the complete vinext tarball recorded in `package-lock.json`, limits npm to one socket, and terminates a stalled install. `build` applies a short timeout. These helpers target Linux and use GNU `timeout`; they are not native macOS scripts.

Scripts that need writable project-scoped home, npm, XDG, and temporary paths use `scripts/sites-env.sh`. The `dev` and `start` scripts honor the caller's runtime environment and keep Wrangler logs inside the checkout. The generated `.sites-runtime/` directory is disposable and ignored by Git.

## Included Shape

- edit site code under `app/`
- `app/chatgpt-auth.ts` provides optional dispatch-owned ChatGPT sign-in helpers
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/index.ts` reads the D1 binding from the Cloudflare Worker environment
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from `oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive `oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty `name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by `oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send anonymous visitors through Sign in with ChatGPT.
- In a Server Component, start sign-in with `<a href={chatGPTSignInPath(returnTo)} target="_top">`. The auth helper module is server-only; do not import it into a Client Component.
- Do not use `fetch`, XHR, a client-side router, or a framework link that can prefetch the sign-in route. SIWC must start as a top-level navigation.
- Never request the AuthAPI authorization endpoint directly. The dispatch-owned `/signin-with-chatgpt` route must start the SIWC flow.
- Use `chatGPTSignOutPath(returnTo)` for browser sign-out links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the OAuth cookies, and identity header injection. Do not implement app routes for those reserved paths. Routes that do not import and call the helper remain anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the Sites hosting platform's access policy controls for workspace-wide restrictions, or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write actions tied to the current ChatGPT user. Leave public content anonymous.

## Diagnostic Commands

- `npm run install:ci`: perform the one bounded lockfile install
- `npm run dev`: start the Vite/Vinext development server
- `npm run build`: build the deployable Sites artifact
- `npm run start`: start the built Vinext application
- `npm test`: build and verify the rendered development-preview metadata
- `npm run db:generate`: generate Drizzle migrations after schema changes

Use build commands for targeted diagnosis after a remote failure, not as part of the normal checkpoint path.

The timeout defaults can be overridden for a controlled canary with `SITES_INSTALL_TIMEOUT`, `SITES_INSTALL_KILL_AFTER`, `SITES_BUILD_TIMEOUT`, and `SITES_BUILD_KILL_AFTER`. A timeout fails the command; the helpers never retry an unchanged install or build.

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)


### Telegram delivery reliability

Admin and Telegram assignments now share the same transactional dispatch service. Booking status, version, driver availability and overlapping jobs are checked before token rotation, assignment replacement and notification enqueueing commit together. Outbound and return legs remain independent.

Telegram booking cards, driver offers/job DMs, trip photos, completion albums, prompts, request cards and handovers use durable delivery records. Definite rejections retry; timeouts/interrupted sends become **uncertain**, so the system does not blindly duplicate them. Admin → Website chat → Telegram shows outstanding notifications, destinations, attempts, next retry and provider errors. Only the owner may confirm a message is missing before retrying an uncertain delivery. Existing zero-ID claims are treated as uncertain and require that review.

Customer cancellation requests are saved before Telegram delivery, with the original request time and accepted policy version. They remain visible in Telegram settings when delivery is unavailable. Refund text uses the accepted-policy calculation; approving cancellation does not automatically issue money.

New outbound messaging is off by default:

- `TELEGRAM_DRIVER_UPDATES=1`: enable private linked-driver cancellation/change notices and Admin assignment job messages. Existing Telegram driver-group job DMs continue to work without this flag.
- `TELEGRAM_RETURN_DRIVER_JOBS=1`: enable independent return offers. Staff must tap **Set return cost** before a return offer is posted; the outbound cost is never assumed to be the return cost.

Apply additive migration `drizzle/0105_telegram_reliability.sql` when managing migrations manually. The new tables are also created on first use because Workers Builds does not apply D1 migrations. See `docs/telegram-reliability-release.md` for verification and recovery.

Expired bin entries are archived rather than deleting parent bookings referenced by financial documents, accepted policies or trip evidence. Archival runs in the scheduled worker; a cleanup failure cannot block an unrelated Bin/Restore request.
