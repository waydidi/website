import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getFile } from "@/lib/file-store";
import { getDb } from "@/db";
import { drivers } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";

export async function GET(_request: Request, context: { params: Promise<{ driverId: string; kind: string }> }) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { driverId, kind } = await context.params;
  if (kind !== "identity" && kind !== "vehicle") return NextResponse.json({ error: "Image not found." }, { status: 404 });
  const [driver] = await getDb().select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
  const key = kind === "identity" ? driver?.idImageKey : driver?.carImageKey;
  const mime = kind === "identity" ? driver?.idImageMime : driver?.carImageMime;
  if (!key) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  const object = await getFile(key);
  if (!object) return NextResponse.json({ error: "Image not found." }, { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": mime ?? object.contentType ?? "image/jpeg", "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="driver-${kind}"`, "X-Content-Type-Options": "nosniff" } });
}
