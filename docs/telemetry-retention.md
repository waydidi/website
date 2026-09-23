# Journey telemetry retention

- Raw `journey_locations` GPS pings are retained for 90 days from server receipt, then are eligible for automatic deletion.
- Booking, payment, passenger-verification, trip-state, exception, and manual-review events are business records and are retained separately from raw GPS.
- A legal, payment, safety, or customer-service hold may pause deletion for the affected journey.
- Raw location access is restricted to authenticated Waydidi operations users and active read-only customer tracking features.
- Phase 3 stores `purge_after` on every ping. The scheduled purge worker is part of the later operations automation phase.
