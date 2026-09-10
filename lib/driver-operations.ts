import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingAssignments } from "@/db/schema";
import { sha256 } from "@/lib/security";

export const DRIVER_STATUSES = [
  "assigned",
  "going_to_standby",
  "standby",
  "passenger_picked_up",
  "completed",
] as const;

export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const NEXT_DRIVER_STATUS: Partial<Record<DriverStatus, DriverStatus>> = {
  assigned: "going_to_standby",
  going_to_standby: "standby",
  standby: "passenger_picked_up",
  passenger_picked_up: "completed",
};

export const DRIVER_STATUS_COPY: Record<DriverStatus, { thai: string; english: string }> = {
  assigned: { thai: "เตรียมเดินทาง", english: "Assigned" },
  going_to_standby: { thai: "กำลังไปสแตนบาย", english: "Going to standby" },
  standby: { thai: "สแตนบาย", english: "Standing by" },
  passenger_picked_up: { thai: "รับลูกค้า", english: "Passenger picked up" },
  completed: { thai: "ส่งลูกค้าเรียบร้อย", english: "Drop-off completed" },
};

export function isDriverStatus(value: string): value is DriverStatus {
  return DRIVER_STATUSES.includes(value as DriverStatus);
}

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

export function distanceMetres(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const earth = 6_371_000;
  const latitude = radians(b.latitude - a.latitude);
  const longitude = radians(b.longitude - a.longitude);
  const value = Math.sin(latitude / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(longitude / 2) ** 2;
  return Math.round(2 * earth * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)));
}

export function evidenceRequired(status: DriverStatus) {
  return status === "standby" || status === "passenger_picked_up" || status === "completed";
}
