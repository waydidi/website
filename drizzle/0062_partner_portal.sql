CREATE TABLE partner_profiles (
 agency_id TEXT PRIMARY KEY REFERENCES agency_applications(id),
 partner_kind TEXT NOT NULL DEFAULT 'agency' CHECK(partner_kind IN ('agency','hotel')),
 billing_name TEXT NOT NULL DEFAULT '', billing_address TEXT NOT NULL DEFAULT '', tax_id TEXT NOT NULL DEFAULT '',
 commission_bps INTEGER NOT NULL DEFAULT 0 CHECK(commission_bps BETWEEN 0 AND 10000),
 updated_at TEXT NOT NULL
);
INSERT INTO partner_profiles(agency_id,updated_at) SELECT id,created_at FROM agency_applications;
CREATE TABLE partner_members (
 agency_id TEXT NOT NULL REFERENCES agency_applications(id), email TEXT NOT NULL COLLATE NOCASE UNIQUE,
 role TEXT NOT NULL CHECK(role IN ('admin','booker','finance','viewer')), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_at TEXT NOT NULL, PRIMARY KEY(agency_id,email)
);
CREATE TABLE partner_rates (
 id TEXT PRIMARY KEY, agency_id TEXT NOT NULL REFERENCES agency_applications(id), label TEXT NOT NULL,
 pickup TEXT NOT NULL, dropoff TEXT NOT NULL, vehicle TEXT NOT NULL,
 service_type TEXT NOT NULL CHECK(service_type IN ('transfer','hourly','tour')), booked_hours INTEGER,
 price_minor INTEGER NOT NULL CHECK(price_minor>0), valid_from TEXT NOT NULL, valid_until TEXT NOT NULL,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL
);
CREATE INDEX idx_partner_rates_agency ON partner_rates(agency_id,active);
CREATE TABLE partner_request_terms (
 form_token TEXT PRIMARY KEY REFERENCES booking_forms(token) ON DELETE CASCADE, agency_id TEXT NOT NULL,
 rate_id TEXT REFERENCES partner_rates(id), rate_snapshot TEXT, commission_bps INTEGER NOT NULL CHECK(commission_bps BETWEEN 0 AND 10000), created_at TEXT NOT NULL
);
CREATE TABLE partner_booking_terms (
 booking_reference TEXT PRIMARY KEY REFERENCES bookings(reference) ON DELETE CASCADE, agency_id TEXT NOT NULL,
 commission_base_minor INTEGER NOT NULL CHECK(commission_base_minor>=0), commission_bps INTEGER NOT NULL CHECK(commission_bps BETWEEN 0 AND 10000),
 rate_snapshot TEXT, created_at TEXT NOT NULL
);
CREATE INDEX idx_partner_booking_terms_agency ON partner_booking_terms(agency_id);
CREATE TABLE partner_payouts (
 id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, period TEXT NOT NULL,
 amount_minor INTEGER NOT NULL CHECK(amount_minor>0), payment_reference TEXT NOT NULL,
 processed_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(agency_id,period)
);
CREATE TABLE partner_invoices (
 id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, booking_reference TEXT NOT NULL UNIQUE,
 amount_minor INTEGER NOT NULL CHECK(amount_minor>=0), snapshot TEXT NOT NULL,
 issued_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_partner_invoices_agency ON partner_invoices(agency_id,created_at);
CREATE TABLE partner_audit (
 id TEXT PRIMARY KEY, agency_id TEXT NOT NULL, actor TEXT NOT NULL,
 action TEXT NOT NULL, details TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX idx_partner_audit_agency ON partner_audit(agency_id,created_at);
