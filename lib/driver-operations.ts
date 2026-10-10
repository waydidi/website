import { cookies, headers } from "next/headers";
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

/** Which link token a "session" request means: this tab's header first, then the browser-wide cookie. */
export const sessionDriverToken = (header: string | null | undefined, cookie: string | null | undefined) => header || cookie || "";

export async function activeAssignmentForToken(token: string) {
  // The link token this tab opened (X-Driver-Token header) first, then the session cookie. The cookie is
  // shared by the whole browser and may still hold an older trip's link (some phones don't replace it).
  if(token==="session") token=sessionDriverToken((await headers()).get("x-driver-token"),(await cookies()).get("waydidi_driver")?.value);
  if (!/^[a-f0-9]{48}$/u.test(token)) return null;
  const [assignment] = await getDb()
    .select()
    .from(bookingAssignments)
    .where(and(eq(bookingAssignments.tokenHash, await sha256(token)), isNull(bookingAssignments.revokedAt)))
    .limit(1);
  if (!assignment || new Date(assignment.tokenExpiresAt).getTime() <= Date.now()) return null;
  return assignment;
}
