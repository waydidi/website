import { env } from "cloudflare:workers";

// Public: serves blog images uploaded in Admin → Blog.
export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  const { name } = await context.params;
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(name) || !env.BUCKET) return new Response("Not found", { status: 404 });
  const object = await env.BUCKET.get(`blog/${name}`);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
