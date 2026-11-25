# WhatsApp template for the 3-day quote reminder

The reminder is sent only to customers who replied **YES** to "Would you like a reminder about this trip in 3 days? Reply YES." under their quote, and only as an approved WhatsApp template (WhatsApp allows nothing else more than 24 hours after the customer's last message). Nothing is sent until the steps below are done and `SALES_AI_TEMPLATE_FOLLOWUPS=1` is set.

## 1. Create the template in WhatsApp Manager

Meta Business Suite → WhatsApp Manager → Message templates → Create template.

- **Category:** Utility (it follows up a quote the customer asked for and agreed to be reminded about). Meta may change it to Marketing, which usually costs more per message; check the current price for Thailand in Meta's WhatsApp pricing page.
- **Name:** `quote_reminder` (lowercase, numbers and underscores only).
- **Languages:** add three translations of the same template. Note the language code Meta shows for each (for example English `en_US` or `en`, Thai `th`, Chinese (China) `zh_CN`).
- **Body** (one variable, `{{1}}` = the trip date, e.g. `2026-12-01`; give it as the sample value):

| Language | Body |
|---|---|
| English | Hi! Your Waydidi transfer quote for {{1}} is still open. Reply to this message and we will confirm an up-to-date price for you. Reply STOP to stop reminders. |
| Thai | สวัสดีครับ ใบเสนอราคารถรับส่ง Waydidi สำหรับวันที่ {{1}} ยังเปิดอยู่ ตอบกลับข้อความนี้แล้วเราจะยืนยันราคาล่าสุดให้ ตอบ STOP เพื่อหยุดการแจ้งเตือน |
| Chinese | 您好！您 {{1}} 的 Waydidi 接送报价仍然有效。回复此消息，我们将为您确认最新价格。回复 STOP 停止提醒。 |

No header, footer or buttons are needed. The same texts are in `messages/*.json` (`salesReminder.templateCopy`), which is what the chat history shows.

## 2. Let Waydidi hear about approvals

In the Meta app (developers.facebook.com) → WhatsApp → Configuration → Webhook fields, subscribe to **message_template_status_update** as well as **messages**. A template Meta rejects, pauses or disables is then never used, and the change appears in Admin → AI activity.

## 3. Cloudflare Worker variables

- `WHATSAPP_TEMPLATE_QUOTE_REMINDER=quote_reminder`
- `WHATSAPP_TEMPLATE_LANGUAGES=en:en_US,th:th,zh:zh_CN` (use the codes Meta showed; a language without a code falls back to English)
- `SALES_AI_TEMPLATE_FOLLOWUPS=1` (turn on last, after approval)

## 4. Try it on the test number

Ask the test number for a transfer price, approve it in Telegram, reply **YES**, then check Admin → AI activity for "Reminder: customer said YES". The reminder is due 3 days after the quote (moved to 08:30 if that falls between 21:00 and 08:00 Bangkok).

## What stops a reminder (checked when it is due)

The customer wrote again after the YES, declined, or wrote STOP; the quote was accepted; the trip date passed; someone has taken the chat; the assistant is switched off on WhatsApp; a reminder was already sent to this customer that week; the template is not approved; or WhatsApp refuses the send (recorded with Meta's error code and never retried).
