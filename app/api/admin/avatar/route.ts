import { NextResponse } from "next/server";
import { deleteFile, getFile, putFile } from "@/lib/file-store";
import { getWaydidiAdmin } from "@/lib/admin";
import { sameOrigin } from "@/lib/security";

const KEY = "admin/avatar";
const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

// The admin's profile photo shown in the top bar.
export async function GET() {
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const file = await getFile(KEY).catch(() => null);
  if (!file) return new Response(null, { status: 404 });
  return new Response(file.body, { headers: { "Content-Type": file.contentType ?? "image/jpeg", "Cache-Control": "private, no-cache", "X-Content-Type-Options": "nosniff" } });
}

export async function POST(request: Request) {
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !TYPES.has(file.type)) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 400 });
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: "The photo must be 2 MB or smaller." }, { status: 400 });
  await putFile(KEY, await file.arrayBuffer(), file.type);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  await deleteFile(KEY).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
