# Driver connectivity recovery

The driver trip page keeps one pending action per assignment in IndexedDB, including its original event ID, time, note, location and photo bytes. Version 2 preserves the existing version 1 store and adds synchronization metadata. A different action cannot overwrite pending work.

Only a successful HTTP 200 response containing `ok: true` and the matching event ID and status acknowledges an action. Lost responses, malformed responses and server errors retain the original action for duplicate-safe replay through the existing server event idempotency guard. An acknowledgment cannot delete a different queued event. Local deletion and the acknowledgment timestamp commit together.

Attempts use a durable 75-second lease across tabs and a 60-second network timeout. Automatic retries use bounded exponential backoff and respect Retry-After. A 429 hold also applies to manual retries. Other rejected actions remain blocked until the driver retries explicitly or confirms local discard; discarding does not change server status. Attempt count, retry state and last successful server contact are visible in Thai. Last sync can reflect a successful trip-data refresh while an action still awaits acceptance.

Storage failures are visible. An online action may still be sent if IndexedDB is unavailable, but an unacknowledged in-memory action is explicitly marked as unsaved and the driver is told to keep the page open. A later storage recovery attempts to persist the same action. This fallback cannot promise survival after closing the page. Offline actions require successful durable storage before the form is cleared.

No new server financial or notification action, Worker flag or D1 migration is introduced. Browser storage remains local to the device and origin; clearing browser data removes pending work. Keep the existing trip authorization and private evidence access controls.

## Verification

- 43 browser checks passed across desktop and phone: queue migration including photo bytes; conflicting saves; competing tabs and stale leases; lost and mismatched acknowledgments; rejection/reload; offline reconnect; storage failure and recovery; confirmed discard; persisted rate limiting; malformed trip responses; existing evidence camera and welcome flows.
- Four pure retry/acknowledgment rule tests passed during implementation.
- TypeScript, focused ESLint and the production vinext build passed on Windows.
- 29 focused rules/server-idempotency/staff-security tests passed, including simultaneous driver retries and denied staff roles.

Keep the PR in draft until the remaining roadmap and release checks are complete. Production rollout is separate from the local and CI evidence above.
