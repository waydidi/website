-- CRM identity is staff-only. Merging contacts NEVER changes customer sign-in or booking ownership.
CREATE TABLE crm_contacts(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT,phone TEXT,member_id TEXT,owner_id TEXT,language TEXT NOT NULL DEFAULT 'en',notes TEXT NOT NULL DEFAULT '',marketing_opt_in INTEGER NOT NULL DEFAULT 0,consent_at TEXT,consent_source TEXT,merged_into TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX crm_contacts_search ON crm_contacts(email,phone);
CREATE INDEX crm_contacts_member ON crm_contacts(member_id);
CREATE TABLE crm_sources(kind TEXT NOT NULL,source_id TEXT NOT NULL,contact_id TEXT NOT NULL REFERENCES crm_contacts(id) DEFERRABLE INITIALLY DEFERRED,PRIMARY KEY(kind,source_id));
CREATE INDEX crm_sources_contact ON crm_sources(contact_id);
CREATE TABLE crm_leads(id TEXT PRIMARY KEY,contact_id TEXT NOT NULL REFERENCES crm_contacts(id) DEFERRABLE INITIALLY DEFERRED,title TEXT NOT NULL,stage TEXT NOT NULL DEFAULT 'new' CHECK(stage IN ('new','quoted','awaiting_payment','won','lost','cancelled')),value_minor INTEGER NOT NULL DEFAULT 0,owner_id TEXT,source TEXT NOT NULL DEFAULT 'manual',booking_reference TEXT,loss_reason TEXT,version INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX crm_leads_stage ON crm_leads(stage,updated_at);
CREATE UNIQUE INDEX crm_leads_booking ON crm_leads(booking_reference) WHERE booking_reference IS NOT NULL;
CREATE TABLE crm_tasks(id TEXT PRIMARY KEY,contact_id TEXT REFERENCES crm_contacts(id) DEFERRABLE INITIALLY DEFERRED,lead_id TEXT REFERENCES crm_leads(id),conversation_id TEXT,title TEXT NOT NULL,due_at TEXT NOT NULL,owner_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','cancelled')),completed_at TEXT,reminded_at TEXT,dedupe_key TEXT UNIQUE,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX crm_tasks_due ON crm_tasks(status,due_at);
CREATE TABLE crm_events(id TEXT PRIMARY KEY,contact_id TEXT REFERENCES crm_contacts(id) DEFERRABLE INITIALLY DEFERRED,entity_id TEXT,kind TEXT NOT NULL,body TEXT NOT NULL,staff_id TEXT,created_at TEXT NOT NULL);
CREATE INDEX crm_events_contact ON crm_events(contact_id,created_at);
CREATE TABLE crm_quotes(id TEXT PRIMARY KEY,contact_id TEXT NOT NULL REFERENCES crm_contacts(id) DEFERRABLE INITIALLY DEFERRED,lead_id TEXT REFERENCES crm_leads(id),version INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','expired','converted')),title TEXT NOT NULL,pickup TEXT NOT NULL,dropoff TEXT NOT NULL,trip_date TEXT NOT NULL,trip_time TEXT NOT NULL,vehicle TEXT NOT NULL,amount_minor INTEGER NOT NULL CHECK(amount_minor>0),expires_at TEXT NOT NULL,token_hash TEXT UNIQUE,form_token TEXT,booking_reference TEXT,accepted_at TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX crm_quotes_contact ON crm_quotes(contact_id,created_at);
CREATE TABLE crm_quote_versions(quote_id TEXT NOT NULL REFERENCES crm_quotes(id),version INTEGER NOT NULL,snapshot_json TEXT NOT NULL,staff_id TEXT,created_at TEXT NOT NULL,PRIMARY KEY(quote_id,version));
CREATE TABLE agency_members(agency_id TEXT NOT NULL REFERENCES agency_applications(id),email TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'booker' CHECK(role IN ('manager','booker')),active INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,PRIMARY KEY(agency_id,email));
CREATE UNIQUE INDEX agency_member_active_email ON agency_members(email) WHERE active=1;
CREATE TABLE crm_partner_accounts(agency_id TEXT PRIMARY KEY REFERENCES agency_applications(id),owner_id TEXT,rate_notes TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL);
CREATE TABLE crm_retention_rules(id TEXT PRIMARY KEY,title TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('inactive','return_transfer')),days INTEGER NOT NULL CHECK(days BETWEEN 1 AND 365),enabled INTEGER NOT NULL DEFAULT 0,owner_id TEXT NOT NULL,message TEXT NOT NULL DEFAULT '',channel TEXT NOT NULL DEFAULT 'task' CHECK(channel IN ('task','email')),created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE crm_outbox(id TEXT PRIMARY KEY,contact_id TEXT REFERENCES crm_contacts(id) DEFERRABLE INITIALLY DEFERRED,rule_id TEXT,dedupe_key TEXT NOT NULL UNIQUE,email TEXT NOT NULL,payload_json TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,attempted_at TEXT,first_attempt_at TEXT,next_attempt_at TEXT,sent_at TEXT,created_at TEXT NOT NULL);
CREATE INDEX crm_outbox_pending ON crm_outbox(status,next_attempt_at);
CREATE TABLE crm_sync_state(id TEXT PRIMARY KEY,last_run_at TEXT);
ALTER TABLE member_reward_emails ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE member_reward_emails ADD COLUMN last_attempt_at TEXT;
ALTER TABLE member_reward_emails ADD COLUMN next_attempt_at TEXT;
ALTER TABLE member_reward_emails ADD COLUMN sent_at TEXT;
UPDATE member_reward_emails SET attempt_count=1,last_attempt_at=created_at WHERE status='sent';
INSERT OR IGNORE INTO crm_contacts(id,name,email,phone,member_id,created_at,updated_at) SELECT 'member:'||id,coalesce(nullif(trim(coalesce(name,'') || ' ' || coalesce(surname,'')),''),'Guest'),lower(email),phone,id,created_at,updated_at FROM customers;
INSERT OR IGNORE INTO crm_sources(kind,source_id,contact_id) SELECT 'member',id,'member:'||id FROM customers;
--> statement-breakpoint
CREATE TRIGGER crm_import_member AFTER INSERT ON customers BEGIN
 INSERT OR IGNORE INTO crm_contacts(id,name,email,phone,member_id,created_at,updated_at) VALUES('member:'||NEW.id,coalesce(nullif(trim(coalesce(NEW.name,'') || ' ' || coalesce(NEW.surname,'')),''),'Guest'),lower(NEW.email),NEW.phone,NEW.id,NEW.created_at,NEW.updated_at);
 INSERT OR IGNORE INTO crm_sources(kind,source_id,contact_id) VALUES('member',NEW.id,'member:'||NEW.id);
END;
--> statement-breakpoint
INSERT OR IGNORE INTO crm_contacts(id,name,email,phone,member_id,created_at,updated_at) SELECT 'booking:'||reference,coalesce(nullif(trim(customer_name || ' ' || coalesce(customer_surname,'')),''),'Guest'),lower(customer_email),customer_phone,NULL,created_at,updated_at FROM bookings;
INSERT OR IGNORE INTO crm_sources(kind,source_id,contact_id) SELECT 'booking',reference,'booking:'||reference FROM bookings;
--> statement-breakpoint
CREATE TRIGGER crm_import_booking AFTER INSERT ON bookings BEGIN
 INSERT OR IGNORE INTO crm_contacts(id,name,email,phone,member_id,created_at,updated_at) VALUES('booking:'||NEW.reference,coalesce(nullif(trim(NEW.customer_name || ' ' || coalesce(NEW.customer_surname,'')),''),'Guest'),lower(NEW.customer_email),NEW.customer_phone,NULL,NEW.created_at,NEW.updated_at);
 INSERT OR IGNORE INTO crm_sources(kind,source_id,contact_id) VALUES('booking',NEW.reference,'booking:'||NEW.reference);
END;
--> statement-breakpoint
INSERT OR IGNORE INTO crm_contacts(id,name,email,phone,member_id,created_at,updated_at) SELECT 'chat:'||id,coalesce(nullif(coalesce(customer_name,'Guest enquiry'),''),'Guest'),lower(customer_email),customer_phone,customer_id,created_at,updated_at FROM website_conversations;
INSERT OR IGNORE INTO crm_sources(kind,source_id,contact_id) SELECT 'chat',id,'chat:'||id FROM website_conversations;
--> statement-breakpoint
CREATE TRIGGER crm_import_chat AFTER INSERT ON website_conversations BEGIN
 INSERT OR IGNORE INTO crm_contacts(id,name,email,phone,member_id,created_at,updated_at) VALUES('chat:'||NEW.id,coalesce(nullif(coalesce(NEW.customer_name,'Guest enquiry'),''),'Guest'),lower(NEW.customer_email),NEW.customer_phone,NEW.customer_id,NEW.created_at,NEW.updated_at);
 INSERT OR IGNORE INTO crm_sources(kind,source_id,contact_id) VALUES('chat',NEW.id,'chat:'||NEW.id);
END;
--> statement-breakpoint
UPDATE crm_contacts SET marketing_opt_in=(SELECT marketing_opt_in FROM customers WHERE id=crm_contacts.member_id),consent_source='member profile' WHERE id LIKE 'member:%';
--> statement-breakpoint
CREATE TRIGGER crm_member_profile AFTER UPDATE ON customers BEGIN
 UPDATE crm_contacts SET name=trim(coalesce(NEW.name,'') || ' ' || coalesce(NEW.surname,'')),email=NEW.email,phone=NEW.phone,language=NEW.language,marketing_opt_in=NEW.marketing_opt_in,consent_at=NEW.updated_at,consent_source='member profile',updated_at=NEW.updated_at WHERE id=(SELECT contact_id FROM crm_sources WHERE kind='member' AND source_id=NEW.id);
END;
--> statement-breakpoint
INSERT OR IGNORE INTO crm_leads(id,contact_id,title,stage,value_minor,source,booking_reference,created_at,updated_at) SELECT 'booking:'||reference,'booking:'||reference,pickup||' → '||dropoff,CASE WHEN status IN ('confirmed','completed') THEN 'won' WHEN status IN ('cancelled','binned') THEN 'cancelled' WHEN status IN ('expired','payment_failed') THEN 'lost' ELSE 'awaiting_payment' END,CAST(round(total*100) AS INTEGER),'booking',reference,created_at,updated_at FROM bookings;
--> statement-breakpoint
CREATE TRIGGER crm_booking_lead AFTER INSERT ON bookings BEGIN
 INSERT OR IGNORE INTO crm_leads(id,contact_id,title,stage,value_minor,source,booking_reference,created_at,updated_at) VALUES('booking:'||NEW.reference,'booking:'||NEW.reference,NEW.pickup||' → '||NEW.dropoff,CASE WHEN NEW.status IN ('confirmed','completed') THEN 'won' WHEN NEW.status IN ('cancelled','binned') THEN 'cancelled' WHEN NEW.status IN ('expired','payment_failed') THEN 'lost' ELSE 'awaiting_payment' END,CAST(round(NEW.total*100) AS INTEGER),'booking',NEW.reference,NEW.created_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER crm_booking_state AFTER UPDATE OF status ON bookings BEGIN
 UPDATE crm_leads SET stage=CASE WHEN NEW.status IN ('confirmed','completed') THEN 'won' WHEN NEW.status IN ('cancelled','binned') THEN 'cancelled' WHEN NEW.status IN ('expired','payment_failed') THEN 'lost' ELSE 'awaiting_payment' END,value_minor=CAST(round(NEW.total*100) AS INTEGER),version=version+1,updated_at=NEW.updated_at WHERE booking_reference=NEW.reference;
 UPDATE crm_tasks SET status='cancelled',updated_at=NEW.updated_at WHERE status='open' AND lead_id IN (SELECT id FROM crm_leads WHERE booking_reference=NEW.reference) AND NEW.status IN ('confirmed','completed','cancelled','binned');
END;
--> statement-breakpoint
INSERT OR IGNORE INTO crm_leads(id,contact_id,title,source,created_at,updated_at) SELECT 'chat:'||id,'chat:'||id,coalesce(topic,'Chat enquiry'),channel,created_at,updated_at FROM website_conversations;
--> statement-breakpoint
CREATE TRIGGER crm_chat_lead AFTER INSERT ON website_conversations BEGIN
 INSERT OR IGNORE INTO crm_leads(id,contact_id,title,source,created_at,updated_at) VALUES('chat:'||NEW.id,'chat:'||NEW.id,coalesce(NEW.topic,'Chat enquiry'),NEW.channel,NEW.created_at,NEW.updated_at);
END;
--> statement-breakpoint
CREATE TRIGGER crm_chat_profile AFTER UPDATE OF customer_name,customer_email,customer_phone ON website_conversations BEGIN
 UPDATE crm_contacts SET name=coalesce(NEW.customer_name,name),email=coalesce(lower(NEW.customer_email),email),phone=coalesce(NEW.customer_phone,phone),updated_at=NEW.updated_at WHERE member_id IS NULL AND id=(SELECT contact_id FROM crm_sources WHERE kind='chat' AND source_id=NEW.id);
END;

--> statement-breakpoint
CREATE TRIGGER crm_merge_guard BEFORE UPDATE OF merged_into ON crm_contacts WHEN NEW.merged_into IS NOT NULL BEGIN
 SELECT CASE WHEN OLD.merged_into IS NOT NULL OR NOT EXISTS(SELECT 1 FROM crm_contacts WHERE id=NEW.merged_into AND merged_into IS NULL AND id<>NEW.id) THEN RAISE(ABORT,'CRM contact changed; refresh before merging') END;
END;
--> statement-breakpoint
-- Verified account links associate operational records without changing their access controls.
UPDATE crm_sources SET contact_id=(SELECT s.contact_id FROM customer_booking_links l JOIN crm_sources s ON s.kind='member' AND s.source_id=l.customer_id WHERE l.booking_reference=crm_sources.source_id) WHERE kind='booking' AND EXISTS(SELECT 1 FROM customer_booking_links l JOIN crm_sources s ON s.kind='member' AND s.source_id=l.customer_id WHERE l.booking_reference=crm_sources.source_id);
UPDATE crm_leads SET contact_id=(SELECT contact_id FROM crm_sources WHERE kind='booking' AND source_id=crm_leads.booking_reference) WHERE booking_reference IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER crm_link_booking AFTER INSERT ON customer_booking_links BEGIN
 UPDATE crm_sources SET contact_id=(SELECT contact_id FROM crm_sources WHERE kind='member' AND source_id=NEW.customer_id) WHERE kind='booking' AND source_id=NEW.booking_reference AND EXISTS(SELECT 1 FROM crm_sources WHERE kind='member' AND source_id=NEW.customer_id);
 UPDATE crm_leads SET contact_id=(SELECT contact_id FROM crm_sources WHERE kind='booking' AND source_id=NEW.booking_reference) WHERE booking_reference=NEW.booking_reference;
END;
--> statement-breakpoint
CREATE TRIGGER crm_move_booking AFTER UPDATE OF customer_id ON customer_booking_links BEGIN
 UPDATE crm_sources SET contact_id=(SELECT contact_id FROM crm_sources WHERE kind='member' AND source_id=NEW.customer_id) WHERE kind='booking' AND source_id=NEW.booking_reference AND EXISTS(SELECT 1 FROM crm_sources WHERE kind='member' AND source_id=NEW.customer_id);
 UPDATE crm_leads SET contact_id=(SELECT contact_id FROM crm_sources WHERE kind='booking' AND source_id=NEW.booking_reference) WHERE booking_reference=NEW.booking_reference;
END;

--> statement-breakpoint
CREATE UNIQUE INDEX crm_quotes_booking ON crm_quotes(booking_reference) WHERE booking_reference IS NOT NULL;

--> statement-breakpoint
CREATE TABLE crm_marketing_tokens(token_hash TEXT PRIMARY KEY,contact_id TEXT NOT NULL REFERENCES crm_contacts(id),expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX crm_marketing_contact ON crm_marketing_tokens(contact_id);

--> statement-breakpoint
-- Signed-in chat relationships are verified server-side; guest email matches still require review.
UPDATE crm_sources SET contact_id=(SELECT s.contact_id FROM website_conversations w JOIN crm_sources s ON s.kind='member' AND s.source_id=w.customer_id WHERE w.id=crm_sources.source_id) WHERE kind='chat' AND EXISTS(SELECT 1 FROM website_conversations w JOIN crm_sources s ON s.kind='member' AND s.source_id=w.customer_id WHERE w.id=crm_sources.source_id);
UPDATE crm_leads SET contact_id=(SELECT contact_id FROM crm_sources WHERE kind='chat' AND source_id=substr(crm_leads.id,6)) WHERE id LIKE 'chat:%';
--> statement-breakpoint
CREATE TRIGGER crm_verified_chat AFTER UPDATE OF customer_id ON website_conversations WHEN NEW.customer_id IS NOT NULL BEGIN
 UPDATE crm_sources SET contact_id=(SELECT contact_id FROM crm_sources WHERE kind='member' AND source_id=NEW.customer_id) WHERE kind='chat' AND source_id=NEW.id AND EXISTS(SELECT 1 FROM crm_sources WHERE kind='member' AND source_id=NEW.customer_id);
 UPDATE crm_leads SET contact_id=(SELECT contact_id FROM crm_sources WHERE kind='chat' AND source_id=NEW.id) WHERE id='chat:'||NEW.id;
END;
--> statement-breakpoint
CREATE UNIQUE INDEX crm_tasks_open_chat ON crm_tasks(conversation_id) WHERE conversation_id IS NOT NULL AND status='open';

--> statement-breakpoint
CREATE TRIGGER crm_quote_revision_guard BEFORE INSERT ON crm_quote_versions BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM crm_quotes WHERE id=NEW.quote_id AND version=NEW.version AND status='draft') THEN RAISE(ABORT,'Quote changed; refresh before revising') END;
END;
--> statement-breakpoint
CREATE TRIGGER crm_quote_conversion_guard BEFORE UPDATE OF booking_reference ON crm_quotes WHEN NEW.booking_reference IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM bookings WHERE reference=NEW.booking_reference AND status IN ('confirmed','completed')) THEN RAISE(ABORT,'Only confirmed bookings can convert a quote') END;
 SELECT CASE WHEN OLD.booking_reference IS NOT NULL AND OLD.booking_reference<>NEW.booking_reference THEN RAISE(ABORT,'Quote already belongs to another booking') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM crm_leads WHERE id=NEW.lead_id AND booking_reference IS NOT NULL AND booking_reference<>NEW.booking_reference) THEN RAISE(ABORT,'Enquiry already belongs to another booking') END;
END;
--> statement-breakpoint
CREATE TRIGGER crm_quote_conversion AFTER UPDATE OF booking_reference ON crm_quotes WHEN NEW.booking_reference IS NOT NULL AND NEW.status='converted' AND OLD.booking_reference IS NULL BEGIN
 UPDATE crm_sources SET contact_id=NEW.contact_id WHERE kind='booking' AND source_id=NEW.booking_reference;
 UPDATE crm_tasks SET lead_id=NEW.lead_id WHERE NEW.lead_id IS NOT NULL AND lead_id IN (SELECT id FROM crm_leads WHERE booking_reference=NEW.booking_reference AND id LIKE 'booking:%' AND id<>NEW.lead_id);
 UPDATE crm_quotes SET lead_id=NEW.lead_id WHERE NEW.lead_id IS NOT NULL AND lead_id IN (SELECT id FROM crm_leads WHERE booking_reference=NEW.booking_reference AND id LIKE 'booking:%' AND id<>NEW.lead_id);
 DELETE FROM crm_leads WHERE NEW.lead_id IS NOT NULL AND booking_reference=NEW.booking_reference AND id LIKE 'booking:%' AND id<>NEW.lead_id;
 UPDATE crm_leads SET contact_id=NEW.contact_id,stage='won',booking_reference=NEW.booking_reference,value_minor=(SELECT CAST(round(total*100) AS INTEGER) FROM bookings WHERE reference=NEW.booking_reference),version=version+1,updated_at=NEW.updated_at WHERE id=NEW.lead_id OR (NEW.lead_id IS NULL AND booking_reference=NEW.booking_reference);
 UPDATE crm_tasks SET status='cancelled',updated_at=NEW.updated_at WHERE status='open' AND lead_id IN (SELECT id FROM crm_leads WHERE booking_reference=NEW.booking_reference);
 INSERT INTO crm_events(id,contact_id,entity_id,kind,body,created_at) VALUES(lower(hex(randomblob(16))),NEW.contact_id,NEW.id,'quote','Quote converted to confirmed booking '||NEW.booking_reference,NEW.updated_at);
END;
