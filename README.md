# Waydidi Travel

A clean full-stack starter running on [vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`
- Linux with `flock`, `curl`, and GNU `timeout`

## Production deployment

Waydidi’s only live site is [https://waydidi-website.contact-waydidi.workers.dev](https://waydidi-website.contact-waydidi.workers.dev). GitHub `main` is the source for the Cloudflare Worker `waydidi-website`. Use Cloudflare Workers Builds for deployment; pushing a review branch alone does not publish it. Keep `WAYDIDI_PUBLIC_URL` in the Worker settings equal to this origin. Do not publish this repository to the former ChatGPT Sites address.

Canonical URLs, structured data, sitemap and robots metadata use `lib/site.ts`. The historical `.openai/hosting.json` is retained for build compatibility and logical bindings; it is not a deployment target.

## Telegram website chat

Customer chat messages are stored on the website and queued for delivery to one Telegram private chat or team group. Staff use Telegram's **Reply** action on the bot notification; the bridge routes the answer to that customer and shows the linked staff display name. The first authorized reply claims an unassigned conversation. Existing assignments are respected, and duplicate Telegram updates cannot duplicate website replies.

Owner setup:

1. Create a bot with Telegram's official `@BotFather`. Start the bot in the intended private chat, or add it to your private team group. Group privacy mode can remain enabled because staff reply directly to the bot's messages.
2. In the production Cloudflare Worker `waydidi-website`, set server secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (the numeric target chat ID, including a negative sign for groups) and `TELEGRAM_WEBHOOK_SECRET` (a new random 32–256 character value containing letters, numbers, `_` or `-`). Never commit tokens or send them in customer chat.
3. Open **Admin → Settings → Telegram · Website chat** and link each trusted numeric Telegram **user ID** to an active owner, operations or support staff profile. Chat IDs and user IDs are different; group membership alone does not authorize replies.
4. Click **Connect Telegram webhook**. The canonical webhook is `https://waydidi-website.contact-waydidi.workers.dev/api/webhooks/telegram`. This registers the secret header and replaces that bot's previous webhook, so use a dedicated Waydidi support bot.
5. Send a test message from website chat. In Telegram, reply to that specific notification and verify the answer and admin name appear in the customer's website chat.

Delivery runs immediately in the Worker's background after a customer POST, with recovery on the existing five-minute cron. Provider failures do not erase customer messages. Delivery retries up to eight times; ambiguous provider timeouts may repeat a Telegram notification, but replayed inbound updates cannot repeat a website reply. Only text replies up to 2,000 characters are supported. Expired conversations, disabled staff, other Telegram chats, unlinked senders and replies from a different assigned admin are rejected. Conversations stay available in Admin → Website Chat.

Tables are created safely on first use for existing deployments; `drizzle/0069_telegram_chat.sql` is the corresponding idempotent migration. Automated integration tests use local D1 and a mocked Telegram provider; live activation requires the Worker secrets, webhook registration and linked staff accounts.

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
