# Operations exception inbox

Operations now has an inbox of open or acknowledged operations alerts, open journey exceptions on active assignments, and failed booking notifications. Critical items come first, followed by newest update. Each response contains up to 100 items, and server-side category filters and Previous/Next controls provide access to further pages. Refresh reloads current state. Review journey opens the existing journey workspace. There are no new messages, payment writes, tables or Worker variables.

Owner and operations staff can acknowledge an operations alert or resolve it with a note. The recorded status is checked in the same database update, so competing acknowledgments have one winner and stale actions cannot reopen resolved alerts. Acknowledgments retain the staff identity and resolution notes retain the resolver identity. Journey exceptions and failed deliveries remain governed by their existing workflows and are not silently dismissed by the inbox.

Both the Worker permission gate and the endpoint restrict access to owner and operations. The endpoint independently rejects guests and other roles, returns no-store responses, and selects no recipient, GPS, token, or payment fields.

Operational error codes now classify built-in error types instead of transforming exception messages, which could contain personal data or credentials. Callers must still supply static event names and carefully allowlisted context; this change does not sanitize arbitrary context or other console calls.

## Validation
CI must pass lint, typecheck, the full unit/integration suite and Playwright. The operations-inbox tests cover route access, action/origin validation, ordering, resolved-item exclusion, recipient omission, complete pagination, competing acknowledgments and stale actions. Browser checks on desktop and phone cover filtering, failed refreshes, acknowledgment, resolution with a note, pagination and filter reset. Before release, inspect the inbox as owner and operations and verify another role is denied.

## Deferred work
This branch is the first increment, not the entire review roadmap. Fresh MFA for sensitive writes, CSP nonces, GPS deletion verification, durable queue migration, production R2 migration, payment reconciliation enhancements and Windows script portability remain separate changes.

Do not simply raise Workers WebCrypto PBKDF2 from 100,000 to 600,000 iterations. Cloudflare documents a production iteration cap (cloudflare/workerd#1346), and local workerd may behave differently. Benchmark a supported KDF or validate production support on an isolated deployment before changing staff authentication. Password hashing is unchanged in this release.

Main deploys to production. Review this branch and its CI results before merging. Roll back by reverting the change; there are no schema migrations.
