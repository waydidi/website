import { getFile } from "@/lib/file-store";

// Public: serves blog images uploaded in Admin → Blog.
export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(name)) return new Response("Not found", { status: 404 });
  const object = await getFile(`blog/${name}`);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": object.contentType ?? "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
