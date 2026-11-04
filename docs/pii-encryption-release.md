# Encrypted bank accounts and tax IDs: release runbook

## What it does

- Driver bank account numbers (`drivers.bank_account_number`, `driver_payout_details.account_number`) and tax IDs (`booking_tax_invoices.tax_id`, `customer_billing_profiles.tax_id`, and the copy inside new receipt snapshots) are encrypted with AES-256-GCM using the Worker secret `PII_ENCRYPTION_KEY`. Each value is bound to its column, so a value copied into another column can't be opened there.
- Staff see these numbers masked. The **owner and finance** get a **Show** button (Reports → Driver payouts, Bookings → Tax invoice requested) and the payout CSV. Every Show and every export is recorded in `sensitive_access_log` (staff id, role, kind, record, time; never the number).
- The idempotency id for a driver's bank details becomes a keyed hash (HMAC), not a plain SHA-256 of the account number, which could be guessed.
- The booking confirmation no longer puts the customer's email in the sign-in link (`/account/sign-in?email=…`). The email is handed to the form through `sessionStorage` on the same device.

Until the key is set, values are stored and read exactly as before.

## Turning it on (owner)

1. Generate a key: `openssl rand -base64 48`. It must be 32+ characters and different from every other secret.
2. **Save a copy in the password manager first.** Without the key, encrypted numbers are lost: the payout report shows "account encrypted (key missing)", tax invoices and the driver bank check refuse, and nothing can recover them.
3. In Cloudflare → Workers → waydidi → Settings → Variables and secrets, add `PII_ENCRYPTION_KEY` as a **secret** and deploy.
4. Admin → Settings → Data protection should show **On**.
5. Within a few minutes the every-minute job encrypts older rows, 25 per table per minute. Each update is guarded on the old value, so it is safe to run alongside normal use and to run twice.

## Checking it

- Reports → Driver payouts: numbers show as `xxxxxx4521`. **Show** (owner and finance) displays the full number.
- Bookings: "Tax invoice requested · Tax ID •••• 1234".
- An operations or support account sees no **Show** button. The API answers 403 for them.
- A customer's own Account → Billing details still shows their full tax ID, and a new tax invoice prints it in full.

## Never

- Change or delete `PII_ENCRYPTION_KEY` once it is set. There is no key rotation yet.
- Put the key in `.env` files committed to git, in chats, or anywhere other than the Cloudflare secret and the password manager.

## Unchanged on purpose

- The Telegram "driver bank details" post and the LINE payment message still carry the full account number, because the team pays drivers from them. Restricting them would change the payout process; that is the owner's call.
- Receipts issued before the key was set keep the tax ID as written. Financial documents are never rewritten.
- Booking-form, itinerary and quote link codes stay retrievable, not hashed: staff copy and re-send those links later, which a hash can't support.

## Rolling back

Removing the code is safe only while the key is still set and older rows are left alone. Encrypted rows need this code and the key to be read. Don't remove the key to "turn it off".
