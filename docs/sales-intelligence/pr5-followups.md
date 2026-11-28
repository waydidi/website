# Sales Intelligence PR 5 release guide

In CRM → Pipeline, priority is 100 for awaiting payment, 85 for a linked accepted quote, 60 for a currently valid sent quote, 30 for a previously quoted enquiry, and 10 for a new enquiry. Closed enquiries have no score. The dashboard counts quotes, so two quotes on one lost enquiry can contribute twice. Each count uses the strongest available evidence. A recorded staff reason takes precedence. A link being issued is a CRM event, and does not establish that it reached the customer.

## Test WhatsApp reminders

1. In the Meta test account, obtain approval for a zero-parameter quote reminder template. Use the same template name in each supported locale (`en_US`, `th`, `zh_CN`). Use the text of `salesQuote.followup` in `messages/` so the inbox transcript matches the send. Meta approves each translation separately.
2. In a test environment, set `SALES_AI_FOLLOWUPS=1` and `SALES_AI_FOLLOWUP_TEMPLATE` to the approved name. Leave the flag empty in production until the owner is ready. The existing WhatsApp assistant kill switch also stops reminders.
3. Use a registered test recipient to request and approve a transfer quote. Open **Admin → CRM → Customers**, open the test contact, and record the recipient's permission under **Conversations**.
4. A quote still open after one hour can receive the first reminder. A second can follow after two hours if WhatsApp accepted the first at least an hour ago and has not reported a failure. A reply, opt-out, staff takeover, newer draft, quote revision, expiry or booking progress stops the sequence. With PR 4 present, accepting or revising any leg stops reminders for the whole quote. A timed-out request is never resent. An ambiguous send remains visible in the inbox or AI activity log.
5. Try a second quote with consent withheld, then one with recorded consent withdrawn. Confirm both produce no reminders. A template is used at every step, including after the 24-hour window if the quote is still valid. The worker never falls back to a free-form message, and the 10-minute idle check-in never follows a reminder (sent, failed or suppressed). Idle check-ins also stop on every channel once staff take a chat or the assistant is paused.
6. To stop reminders, clear `SALES_AI_FOLLOWUPS`. A customer's STOP reply withdraws their consent for this chat. Any staff role can record other opt-outs on their conversation in CRM; only the owner can record consent. This setting is separate from email marketing consent.

[Meta WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/)
