# Waydidi Travel PWA

Waydidi can be installed as a standalone home-screen app from the same HTTPS domain as the website. Its app identity and shortcuts use relative URLs, so custom domains and the existing Worker each work independently. Installation does not require an app store, new paid service, database migration or extra environment key.

## Customer experience

- Footer: **Install Waydidi**, with English, Thai and Chinese instructions. Supported browsers show their native install prompt after the customer clicks. iPhone/iPad customers receive Safari → Share → Add to Home Screen instructions. Browsers without a native prompt receive browser-menu instructions. The control disappears in standalone mode or after installation.
- Branded 192px and 512px icons, including padding for maskable launcher icons; existing Apple touch icon retained. Manifest shortcuts open booking, booking management and contact.
- Offline navigation: a small branded page explains that booking, payment, maps and tracking require internet. Customers can retry the current URL or call +66 63-206-4884.

## Cache and updates

Only `/offline.html` and the two PWA icons are stored by the service worker. It never caches customer HTML, booking references, tokens, API responses, payment data, live maps or driver positions. Non-GET requests, cross-origin traffic, API endpoints and RSC requests are passed through. There is no background booking/payment retry or push notification subscription.

Normal navigation is network-first without writing its response to a cache. HTTP errors are preserved. Only a network failure returns the generic offline page. An unsuccessful service-worker install leaves the existing worker intact.

Registration is production-only, requires a secure context, and bypasses the HTTP cache when checking worker updates. `public/_headers` marks the worker and manifest for revalidation. When changing the offline kit, bump `CACHE_NAME` in `public/sw.js`. New workers wait for the old worker’s tabs to close; they do not interrupt checkout or auto-reload active driver pages. Activation cleans only caches with the Waydidi PWA prefix.

## Release checks

1. Build and run the focused PWA tests, TypeScript and changed-file lint.
2. Deploy through the existing Cloudflare Workers flow; no database migration.
3. On the final HTTPS domain, check `/manifest.webmanifest`, `/sw.js`, `/offline.html` and both icon URLs return the correct types, and `/sw.js` has `Cache-Control: no-cache`.
4. Chrome/Edge: install from the footer, launch standalone, check shortcuts. Safari on iPhone: Share → Add to Home Screen, launch and check safe-area layout.
5. After the worker controls the page, turn off networking and navigate/reload. Verify the offline help page, retry, phone link and translated instructions. Restore networking and retry the booking page.
6. In browser storage, verify the PWA cache contains exactly the public offline kit. Check checkout, admin and trip pages still fetch fresh data. Close all app/site windows and reopen to activate a future worker update.

Browser installation UI varies. Beforeinstallprompt is not supported everywhere; the manual instructions are deliberate. Live-device installation still needs checks after deployment on the chosen domain.
