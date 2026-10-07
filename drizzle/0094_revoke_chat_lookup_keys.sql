-- Retire owner keys that the former unverified chat lookup disclosed.
-- Only bookings represented in an old lookup card or owner-link message are affected.
INSERT OR IGNORE INTO booking_events(booking_reference,event_type,provider_event_id,created_at)
SELECT b.reference,'trip_owner_revoked','chat-lookup-revoked:' || b.reference,strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM bookings b WHERE EXISTS(
 SELECT 1 FROM website_chat_messages m WHERE m.is_bot=1 AND (
  (CASE WHEN json_valid(m.card_json) THEN json_extract(m.card_json,'$.type')='booking' AND json_extract(m.card_json,'$.reference')=b.reference AND json_extract(m.card_json,'$.rideUrl') LIKE '%?ride=%' ELSE 0 END)
  OR m.body LIKE '%/trip/' || b.reference || '?ride=%'
 )
);
--> statement-breakpoint
UPDATE website_chat_messages SET body='Sign in to your Waydidi account to view your booking details securely.',card_json=NULL
WHERE is_bot=1 AND (
 (CASE WHEN json_valid(card_json) THEN json_extract(card_json,'$.type')='booking' AND json_extract(card_json,'$.rideUrl') LIKE '%?ride=%' ELSE 0 END)
 OR body LIKE '%/trip/%?ride=%'
);
