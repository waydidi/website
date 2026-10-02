# Hotel and agency portal

Apply D1 migration `0062_partner_portal.sql` before deploying this branch. It extends the approved agency account and booking-form workflows; it does not create an independent payment provider or automatically reserve vehicles.

## Routes and access

- `/partners` opens `/agency`; verified customer email sign-in is reused.
- `/hotels` provides hotel/concierge applications. `/agencies/register` handles verified partner applications and the form accepts hotels, travel agents and host agencies.
- Staff approve partners at `/admin/agencies`. Operations can review applications. Account mappings to multiple approved partners fail closed and require staff resolution.
- A partner's primary contact is its administrator. Administrators add verified work-email users in the Team tab; roles are admin, booker, finance and viewer. No invitation email is sent by the portal. A work email belongs to one partner. Disabling a member or declining the partner takes effect on subsequent requests, even with an existing customer login session.
- Booking and confirmation endpoints verify the booking's partner source. Invoice and commission endpoints additionally require partner admin/finance access. Booking responses and browser props omit provider identifiers, confirmation hashes, private costs and tracking bearer keys. View-only and finance-only users do not receive request-form tokens.

## Agreements and requests

Finance/owner staff configure billing details, commission percentages and rate cards at `/admin/partners`. Prices use integer satang; commissions use integer basis points and exact proportional arithmetic. A rate specifies service, pickup, destination, vehicle, optional hourly duration and valid pickup dates. Rates are immutable; disable and replace them to revise prices. Existing bookings retain their rate and commission snapshot. Old bookings receive no inferred retroactive commission.

Partners create either custom quote requests or requests using agreed rates. The existing guest form locks the selected rate's route/vehicle. Server submission and conversion recheck partner approval, rate activation, pickup date and itinerary. Return journeys require a separate quote. Staff must use the exact negotiated base fare; extras are calculated separately. Commission terms are captured when the partner creates the request. Booking, source attribution, accepted policy and commission snapshot are written in one D1 batch. Request conversion is claimed atomically to prevent duplicate bookings.

Operations still confirms availability and creates the booking. The portal does not promise instant availability or send an unapproved quote straight to payment. Existing LINE/email request alerts remain the operations notification path.

## Commission and invoices

Commission applies to the base fare after discount, excluding extras, only after a completed and fully paid trip. Cash needs a recorded receipt. Issued and reserved refunds proportionally reduce the eligible base. Statements use pickup month in Thailand, export integer satang in CSV, and show earned, paid and balance amounts. Finance records an already-made external payment with an evidence reference; this does not transfer money. A unique partner/month settlement prevents duplicate records. Later refunds can produce a negative balance that finance must adjust. This first version supports one settlement record per month, not automated bank payouts or credit-note reconciliation.

Set `WAYDIDI_INVOICE_LEGAL_NAME` and `WAYDIDI_INVOICE_ADDRESS`, plus `WAYDIDI_INVOICE_TAX_ID` when applicable. Partner billing name and address must be configured before issue. Finance issues one commercial invoice per confirmed/completed partner booking. Issuer, buyer and amount are immutable snapshots. The authenticated invoice document supports browser printing/save-as-PDF and Unicode names/addresses. It is labelled a commercial invoice, not a VAT tax invoice or proof of payment. Refund/cancellation status is displayed separately; adjustments are handled by finance rather than silently rewriting an invoice.

Contract changes, invoice issuance, settlements and team access changes are recorded in `partner_audit`. Financial staff retain control of agreement terms; partner administrators can manage their team but cannot set their own prices or commissions.

## First release limits

The dashboard shows the latest 300 partner bookings and 50 open requests, with search, date/status filters, trip details and confirmation PDFs. Invoices show the latest 200 issued documents. Older records remain available to operations. No partner bank details, automatic payouts, automatic credit billing, self-service itinerary changes or VAT accounting are introduced.

Validate deployment with two separate partner accounts: request and confirm a negotiated trip, record payment, complete the trip, inspect commission, issue an invoice, then verify that the other partner and a view-only teammate cannot access financial documents. Configure real issuer details and use agreed partner terms before issuing production documents.
