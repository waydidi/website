import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingAssignments } from "@/db/schema";
import { sha256 } from "@/lib/security";

export {
  ACTIVE_TRIP_STATUSES,
  adminReviewRequired,
  DRIVER_STATUS_COPY,
  DRIVER_STATUSES,
  distanceMetres,
  evidenceRequired,
  FINAL_DRIVER_STATUSES,
  isDriverStatus,
  locationRequired,
  NEXT_DRIVER_STATUS,
} from "@/lib/trip-rules";
export type { DriverStatus } from "@/lib/trip-rules";

export async function activeAssignmentForToken(token: string) {
  if (!/^[a-f0-9]{48}$/u.test(token)) return null;
  const [assignment] = await getDb()
    .select()
    .from(bookingAssignments)
    .where(and(eq(bookingAssignments.tokenHash, await sha256(token)), isNull(bookingAssignments.revokedAt)))
    .limit(1);
  if (!assignment || new Date(assignment.tokenExpiresAt).getTime() <= Date.now()) return null;
  return assignment;
}
