// Named groups of booking statuses. Use these instead of writing the lists out, so every
// report, reward and money check agrees on what counts.

/** The ride is booked for real (not cancelled, expired or binned): counts for revenue, rewards, CRM and referrals. */
export const COMMITTED_BOOKING_STATUSES = ["confirmed", "completed"] as const;
/** Money and driver costs can be recorded: committed bookings plus no-shows (a no-show still pays). */
export const CHARGEABLE_BOOKING_STATUSES = ["confirmed", "completed", "no_show"] as const;

export const isCommittedStatus = (status: string) => (COMMITTED_BOOKING_STATUSES as readonly string[]).includes(status);
export const isChargeableStatus = (status: string) => (CHARGEABLE_BOOKING_STATUSES as readonly string[]).includes(status);

/** The same lists for raw SQL, e.g. `status IN (${COMMITTED_SQL})`. Built only from the constants above. */
export const COMMITTED_SQL = COMMITTED_BOOKING_STATUSES.map((s) => `'${s}'`).join(",");
export const CHARGEABLE_SQL = CHARGEABLE_BOOKING_STATUSES.map((s) => `'${s}'`).join(",");
