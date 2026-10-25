# Operations exception inbox

Operations now has a read-only inbox of open or acknowledged operations alerts, open journey exceptions on active assignments, and failed booking notifications. Critical items come first, followed by newest update. The response is bounded to 100 items and indicates overflow. Category filters apply to the loaded items; Refresh reloads current state. Review journey opens the existing journey workspace. There are no new messages, automatic resolutions, payment writes, tables or Worker variables.

Both the Worker permission gate and the endpoint restrict access to owner and operations. The endpoint independently rejects guests and other roles, returns no-store responses, and selects no recipient, GPS, token, or payment fields.

Operational error codes now classify built-in error types instead of transforming exception messages, which could contain personal data or credentials. Callers must still supply static event names and carefully allowlisted context; this change does not sanitize arbitrary context or other console calls.

## Validation
CI must pass lint, typecheck, the full unit/integration suite and Playwright. The new operations-inbox test covers route access, ordering, resolved-item exclusion, recipient omission, result limits and private exception messages. Before release, inspect the inbox as owner and operations, verify another role is denied, review an existing journey and test refresh after resolving an alert through its existing workflow.

## Deferred work
This branch is the first increment, not the entire review roadmap. Fresh MFA for sensitive writes, CSP nonces, GPS deletion verification, durable queue migration, production R2 migration, payment reconciliation enhancements and Windows script portability remain separate changes.

Do not simply raise Workers WebCrypto PBKDF2 from 100,000 to 600,000 iterations. Cloudflare documents a production iteration cap (cloudflare/workerd#1346), and local workerd may behave differently. Benchmark a supported KDF or validate production support on an isolated deployment before changing staff authentication. Password hashing is unchanged in this release.

Main deploys to production. Review this branch and its CI results before merging. Roll back by reverting the change; there are no schema migrations.
