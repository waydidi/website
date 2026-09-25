import { NextResponse } from "next/server";
import { z } from "zod";
import { getWaydidiAdmin } from "@/lib/admin";
import { deletePostForever, importStarterPosts, postInputSchema, savePost } from "@/lib/blog-store";
import { purgeBlogCache } from "@/lib/blog-cache";
import { isJsonRequest, sameOrigin } from "@/lib/security";

const other = z.discriminatedUnion("action", [
  z.object({ action: z.literal("delete"), id: z.string().max(80) }),
  z.object({ action: z.literal("import") }),
]);

// Admin-only: create, update, trash, delete and import blog posts.
export async function POST(request: Request) {
  const admin = await getWaydidiAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!sameOrigin(request) || !isJsonRequest(request)) return NextResponse.json({ error: "Request blocked" }, { status: 403 });
  const body = await request.json().catch(() => null) as { action?: string; post?: unknown } | null;
  if (body?.action === "save") {
    const parsed = postInputSchema.safeParse(body.post);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json({ error: issue?.message ?? "Check the post.", field: issue?.path.join(".") }, { status: 400 });
    }
    const result = await savePost(parsed.data);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 409 });
    await purgeBlogCache(new URL(request.url).origin, [result.slug]);
    console.info("Admin saved blog post", { id: result.id, status: parsed.data.status, admin: admin.email });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  }
  const parsed = other.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  await purgeBlogCache(new URL(request.url).origin);
  if (parsed.data.action === "delete") { await deletePostForever(parsed.data.id); return NextResponse.json({ ok: true }); }
  return NextResponse.json({ ok: true, imported: await importStarterPosts() });
}
