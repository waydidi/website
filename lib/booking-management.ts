import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/db";
import { bookingManagementSessions, bookings } from "@/db/schema";
import { sha256 } from "@/lib/security";

export const MANAGEMENT_COOKIE = "waydidi_manage";
export const HOUR = 60 * 60 * 1000;

export function pickupInstant(date: string, time: string) {
  return new Date(`${date}T${time}:00+07:00`).getTime();
}

export function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("cookie") ?? "";
  return cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? "";
}

export async function managedBooking(request: Request) {
  const token = cookieValue(request, MANAGEMENT_COOKIE);
  if (!token || token.length > 200) return null;
  const tokenHash = await sha256(token);
  const [session] = await getDb().select().from(bookingManagementSessions).where(and(eq(bookingManagementSessions.tokenHash, tokenHash), gt(bookingManagementSessions.expiresAt, new Date().toISOString()))).limit(1);
  if (!session) return null;
  const [booking] = await getDb().select().from(bookings).where(eq(bookings.reference, session.bookingReference)).limit(1);
  if (!booking) return null;
  await getDb().update(bookingManagementSessions).set({ lastUsedAt: new Date().toISOString() }).where(eq(bookingManagementSessions.id, session.id));
  return booking;
}

export function managementCookie(token: string, maxAge = 900) {
  return `${MANAGEMENT_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function canManageStatus(status: string) {
  return status === "confirmed";
}
