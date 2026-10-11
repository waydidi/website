import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { prepareDriverImage } from "@/lib/admin-driver-images";
import { putFile } from "@/lib/file-store";
import { sameOrigin } from "@/lib/security";

// An admin adds a photo to a booking's evidence (Stand by / Pick up / Drop). Stored on its own, no Telegram.
type Stmt = { bind: (...v: unknown[]) => Stmt; first: <T>() => Promise<T | null>; run: () => Promise<unknown> };
const db = () => env.DB as unknown as { prepare: (sql: string) => Stmt };
const STEPS = new Set(["standby", "trip_started", "completed"]);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "Blocked" }, { status: 403 });
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Choose a photo." }, { status: 400 });
  const reference = String(form.get("reference") ?? "").toUpperCase(), leg = form.get("leg") === "return" ? "return" : "outbound", step = String(form.get("step") ?? "");
  if (!STEPS.has(step)) return NextResponse.json({ error: "Unknown step." }, { status: 400 });
  const booking = await db().prepare("SELECT reference FROM bookings WHERE reference=?").bind(reference).first<{ reference: string }>();
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  let image;
  try { image = await prepareDriverImage(form.get("photo"), "photo"); } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
  const id = crypto.randomUUID(), key = `admin-evidence/${reference}/${id}.${image.extension}`;
  await putFile(key, image.bytes, image.mime);
  await db().prepare("INSERT INTO admin_evidence_photos(id,booking_reference,leg,step,file_key,mime,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?)")
    .bind(id, reference, leg, step, key, image.mime, admin.email, new Date().toISOString()).run();
  return NextResponse.json({ ok: true, id });
}
