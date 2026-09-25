import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { deleteFile } from "@/lib/file-store";
import { getDb } from "@/db";
import { bookingAssignments, driverAvailability, driverOffers, drivers, operationsCalendarEvents } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";
import { sameOrigin } from "@/lib/security";

export async function DELETE(request: Request, context: { params: Promise<{ driverId: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const { driverId } = await context.params;
  const [driver] = await getDb().select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
  if (!driver) return NextResponse.json({ error: "Driver not found." }, { status: 404 });
  const [assignment] = await getDb().select({ id: bookingAssignments.id }).from(bookingAssignments).where(eq(bookingAssignments.driverId, driverId)).limit(1);
  if (assignment) return NextResponse.json({ error: "This driver has journey history and cannot be permanently deleted. Set the driver inactive instead." }, { status: 409 });

  await getDb().batch([
    getDb().delete(driverAvailability).where(eq(driverAvailability.driverId, driverId)),
    getDb().delete(driverOffers).where(eq(driverOffers.driverId, driverId)),
    getDb().delete(operationsCalendarEvents).where(eq(operationsCalendarEvents.driverId, driverId)),
    getDb().delete(drivers).where(eq(drivers.id, driverId)),
  ]);
  await Promise.all([driver.idImageKey, driver.carImageKey].filter(Boolean).map((key) => deleteFile(key!))).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
