import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { prepareDriverImage } from "@/lib/admin-driver-images";
import { deleteFile, putFile } from "@/lib/file-store";
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
  await Promise.all([driver.idImageKey, driver.carImageKey, driver.photoKey].filter(Boolean).map((key) => deleteFile(key!))).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

// Profile photo and vehicle type for an existing driver.
export async function PATCH(request: Request, context: { params: Promise<{ driverId: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const { driverId } = await context.params;
  const [driver] = await getDb().select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
  if (!driver) return NextResponse.json({ error: "Driver not found." }, { status: 404 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Use the driver form." }, { status: 415 });
  const changes: Partial<typeof drivers.$inferInsert> = { updatedAt: new Date().toISOString() };
  const type = form.get("vehicleType");
  if (type !== null) {
    if (!["sedan", "suv", "minivan"].includes(String(type))) return NextResponse.json({ error: "Choose sedan, SUV or minivan." }, { status: 400 });
    changes.vehicleType = String(type);
  }
  const file = form.get("profilePhoto");
  let oldKey: string | null = null;
  if (file instanceof File && file.size > 0) {
    try {
      const photo = await prepareDriverImage(file, "profile photo");
      const key = `driver-verification/${driverId}/profile-${Date.now()}.${photo.extension}`;
      await putFile(key, photo.bytes, photo.mime);
      oldKey = driver.photoKey; changes.photoKey = key; changes.photoMime = photo.mime;
    } catch (cause) { return NextResponse.json({ error: cause instanceof Error ? cause.message : "The photo could not be saved." }, { status: 400 }); }
  }
  await getDb().update(drivers).set(changes).where(eq(drivers.id, driverId));
  if (oldKey) await deleteFile(oldKey).catch(() => undefined);
  return NextResponse.json({ ok: true, hasPhoto: Boolean(changes.photoKey ?? driver.photoKey), vehicleType: changes.vehicleType ?? driver.vehicleType });
}
