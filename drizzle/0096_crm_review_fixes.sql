-- Keep member compatibility inside the write transaction, including concurrent merges.
CREATE TRIGGER crm_merge_member_guard BEFORE UPDATE OF merged_into ON crm_contacts WHEN NEW.merged_into IS NOT NULL BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM crm_contacts target WHERE target.id=NEW.merged_into AND OLD.member_id IS NOT NULL AND target.member_id IS NOT NULL AND OLD.member_id<>target.member_id)
 OR EXISTS(SELECT 1 FROM crm_sources a JOIN crm_sources b ON b.contact_id=NEW.merged_into AND b.kind='member' WHERE a.contact_id=OLD.id AND a.kind='member' AND a.source_id<>b.source_id)
 THEN RAISE(ABORT,'Two registered accounts cannot be merged') END;
END;
--> statement-breakpoint
-- Collapse only empty import shells; contacts with staff notes or CRM history remain reviewable.
UPDATE crm_contacts SET merged_into=(SELECT s.contact_id FROM crm_sources s WHERE (s.kind='booking' AND crm_contacts.id='booking:'||s.source_id) OR (s.kind='chat' AND crm_contacts.id='chat:'||s.source_id)),marketing_opt_in=0
 WHERE merged_into IS NULL AND owner_id IS NULL AND notes='' AND (id LIKE 'booking:%' OR id LIKE 'chat:%')
 AND NOT EXISTS(SELECT 1 FROM crm_sources s WHERE s.contact_id=crm_contacts.id)
 AND NOT EXISTS(SELECT 1 FROM crm_leads l WHERE l.contact_id=crm_contacts.id AND l.id<>crm_contacts.id)
 AND NOT EXISTS(SELECT 1 FROM crm_tasks t WHERE t.contact_id=crm_contacts.id)
 AND NOT EXISTS(SELECT 1 FROM crm_quotes q WHERE q.contact_id=crm_contacts.id)
 AND NOT EXISTS(SELECT 1 FROM crm_events e WHERE e.contact_id=crm_contacts.id)
 AND NOT EXISTS(SELECT 1 FROM crm_outbox o WHERE o.contact_id=crm_contacts.id)
 AND NOT EXISTS(SELECT 1 FROM crm_marketing_tokens m WHERE m.contact_id=crm_contacts.id) AND EXISTS(SELECT 1 FROM crm_sources s JOIN crm_contacts target ON target.id=s.contact_id AND target.merged_into IS NULL WHERE ((s.kind='booking' AND crm_contacts.id='booking:'||s.source_id) OR (s.kind='chat' AND crm_contacts.id='chat:'||s.source_id)) AND s.contact_id<>crm_contacts.id AND (crm_contacts.member_id IS NULL OR target.member_id IS NULL OR crm_contacts.member_id=target.member_id));
--> statement-breakpoint
CREATE TRIGGER crm_collapse_import_shell AFTER UPDATE OF contact_id ON crm_sources WHEN OLD.contact_id<>NEW.contact_id BEGIN
 UPDATE crm_contacts SET merged_into=NEW.contact_id,marketing_opt_in=0 WHERE id=OLD.contact_id AND merged_into IS NULL AND owner_id IS NULL AND notes='' AND (id LIKE 'booking:%' OR id LIKE 'chat:%')
 AND NOT EXISTS(SELECT 1 FROM crm_sources s WHERE s.contact_id=crm_contacts.id)
 AND NOT EXISTS(SELECT 1 FROM crm_leads l WHERE l.contact_id=crm_contacts.id AND l.id<>crm_contacts.id)
 AND NOT EXISTS(SELECT 1 FROM crm_tasks t WHERE t.contact_id=crm_contacts.id)
 AND NOT EXISTS(SELECT 1 FROM crm_quotes q WHERE q.contact_id=crm_contacts.id)
 AND NOT EXISTS(SELECT 1 FROM crm_events e WHERE e.contact_id=crm_contacts.id)
 AND NOT EXISTS(SELECT 1 FROM crm_outbox o WHERE o.contact_id=crm_contacts.id)
 AND NOT EXISTS(SELECT 1 FROM crm_marketing_tokens m WHERE m.contact_id=crm_contacts.id)
 AND EXISTS(SELECT 1 FROM crm_contacts target WHERE target.id=NEW.contact_id AND target.merged_into IS NULL AND (crm_contacts.member_id IS NULL OR target.member_id IS NULL OR crm_contacts.member_id=target.member_id));
END;
--> statement-breakpoint
CREATE TRIGGER crm_booking_details AFTER UPDATE OF total,pickup,dropoff ON bookings BEGIN
 UPDATE crm_leads SET title=NEW.pickup||' → '||NEW.dropoff,value_minor=CAST(round(NEW.total*100) AS INTEGER),version=version+1,updated_at=NEW.updated_at WHERE booking_reference=NEW.reference;
END;
