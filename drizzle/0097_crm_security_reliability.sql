-- Session activity must not overwrite staff profiles or re-enable cleared consent.
DROP TRIGGER crm_member_profile;
--> statement-breakpoint
CREATE TRIGGER crm_member_profile AFTER UPDATE OF name,surname,email,phone,language ON customers BEGIN
 UPDATE crm_contacts SET name=coalesce(nullif(trim(coalesce(NEW.name,'')||' '||coalesce(NEW.surname,'')),''),'Guest'),email=NEW.email,phone=NEW.phone,language=NEW.language,
 marketing_opt_in=CASE WHEN coalesce(email,'')<>NEW.email THEN 0 ELSE marketing_opt_in END,updated_at=NEW.updated_at
 WHERE id=(SELECT contact_id FROM crm_sources WHERE kind='member' AND source_id=NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER crm_member_consent AFTER UPDATE OF marketing_opt_in ON customers BEGIN
 UPDATE crm_contacts SET marketing_opt_in=NEW.marketing_opt_in,consent_at=NEW.updated_at,consent_source='member preference',updated_at=NEW.updated_at
 WHERE id=(SELECT contact_id FROM crm_sources WHERE kind='member' AND source_id=NEW.id);
END;
--> statement-breakpoint
CREATE TRIGGER crm_new_member_consent AFTER INSERT ON crm_sources WHEN NEW.kind='member' BEGIN
 UPDATE crm_contacts SET marketing_opt_in=(SELECT marketing_opt_in FROM customers WHERE id=NEW.source_id),consent_source='member preference' WHERE id=NEW.contact_id;
END;
--> statement-breakpoint
ALTER TABLE crm_tasks ADD COLUMN reminder_claimed_at TEXT;
ALTER TABLE crm_tasks ADD COLUMN reminder_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE crm_tasks ADD COLUMN reminder_error TEXT;

--> statement-breakpoint
CREATE TABLE IF NOT EXISTS referral_codes (customer_id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS referral_uses (booking_reference TEXT PRIMARY KEY, referrer_id TEXT NOT NULL, friend_email TEXT, friend_phone TEXT, status TEXT NOT NULL DEFAULT 'pending', reward_code TEXT, created_at TEXT NOT NULL, rewarded_at TEXT);
CREATE INDEX IF NOT EXISTS idx_referral_rewards ON referral_uses(referrer_id,status,rewarded_at);
-- Legacy interrupted jobs cannot safely be blindly rewarded again.
UPDATE referral_uses SET status='needs_review' WHERE status='rewarding';
