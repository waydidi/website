# Waydidi Travel

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Production deployment

Waydidi’s only live site is [https://waydidi-website.contact-waydidi.workers.dev](https://waydidi-website.contact-waydidi.workers.dev). GitHub `main` is the source for the Cloudflare Worker `waydidi-website`. Use Cloudflare Workers Builds for deployment; pushing a review branch alone does not publish it. Keep `WAYDIDI_PUBLIC_URL` in the Worker settings equal to this origin. Do not publish this repository to the former ChatGPT Sites address.

Canonical URLs, structured data, sitemap and robots metadata use `lib/site.ts`. The historical `.openai/hosting.json` is retained for build compatibility and logical bindings; it is not a deployment target.

## Telegram website chat

Website chat is one conversation stored in D1 and shown in three places: the customer's chat window, **Admin → Website chat**, and a Telegram staff group. Customer messages are saved first and then posted to Telegram as a card (customer, page, status, latest message) with buttons (Assign to me, Reply, Pending, Close, Open in Admin). Staff answer by replying to the card, a mirrored message or a "Reply" prompt. Status and assignment changes edit the original card instead of posting new ones. New bookings also get a Telegram card.

Owner setup:

1. Create a bot with `@BotFather` (`/newbot`), add it to your private staff group, and get the group's numeric chat ID (negative for groups).
2. In the Cloudflare Worker `waydidi-website`, add secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` and `TELEGRAM_WEBHOOK_SECRET` (16–256 letters, numbers, `_` or `-`). Never commit them.
3. Open **Admin → Website chat → Telegram team**, press **Connect webhook** (registers `/api/integrations/telegram/webhook` with the secret header; `/api/webhooks/telegram` is an alias), then **Send test message**.
4. Each staff member sends `/id` in the group; add their numeric ID and the name customers should see. Only these approved, enabled people can reply, assign or close from Telegram.

Updates are de-duplicated by `update_id`, the webhook secret is checked on every call, callbacks are re-validated server side, and replies are routed only by stored Telegram message ids, never by name. Failed Telegram deliveries keep the customer's message and are retried by the five-minute cron. The schema is in `drizzle/0069_chat_telegram.sql`.

## Non (chat assistant) on website, WhatsApp and LINE

Non answers customer chats instantly, quoting only from the site's price tables and searching the notes under **Admin → Chat → Non knowledge** (plus the attraction database). It hands over to staff (with a Telegram alert) when it can't help. Secrets go in Cloudflare (Workers → Settings → Variables and secrets), never in the code:

- `ANTHROPIC_API_KEY` turns Non on. `GOOGLE_MAPS_SERVER_KEY` is needed for route prices.
- **WhatsApp** (Meta WhatsApp Cloud API): `WHATSAPP_TOKEN` (permanent system-user token), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, and `WHATSAPP_VERIFY_TOKEN` (any long random text). In the Meta app's WhatsApp → Configuration, set the callback URL to `https://<your domain>/api/integrations/whatsapp/webhook` with the same verify token and subscribe to `messages`. Staff can reply free-form only within 24 hours of the customer's last message (WhatsApp's rule).
- **LINE** (LINE Official Account → Messaging API): `LINE_CHANNEL_ACCESS_TOKEN` and `LINE_CHANNEL_SECRET`. Set the webhook URL to `https://<your domain>/api/integrations/line/webhook`, turn "Use webhook" on and LINE's own auto-reply off. Replies use push messages, which count against the LINE plan's monthly message quota.
- Model and monthly cost are on the Non knowledge tab. `ANTHROPIC_API_KEY=... node scripts/cee-eval.mjs` runs the 100 test questions against the real model (costs real money) and writes `cee-eval-report.md` with answers, timings and cost.

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
