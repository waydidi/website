import { env } from "cloudflare:workers";
import { NextResponse } from "next/server";
import { getWaydidiAdmin } from "@/lib/admin";
import { sameOrigin } from "@/lib/security";

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const MAX_BYTES = 5 * 1024 * 1024;

// Admin-only: upload an image for a blog post (featured image or image block).
export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  if (!env.BUCKET) return NextResponse.json({ error: "Image storage isn't configured." }, { status: 503 });
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Images must be 5 MB or smaller." }, { status: 400 });
  const name = `${crypto.randomUUID()}.${ext}`;
  await env.BUCKET.put(`blog/${name}`, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return NextResponse.json({ ok: true, url: `/api/blog-images/${name}` });
}
