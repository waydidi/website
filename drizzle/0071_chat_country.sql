-- Country the visitor was browsing from when the chat started (Cloudflare IP country, ISO code).
ALTER TABLE website_conversations ADD COLUMN customer_country TEXT;
