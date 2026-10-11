import { env } from "cloudflare:workers";
import { getWaydidiAdmin } from "@/lib/admin";
import { getFile } from "@/lib/file-store";

// An admin-added evidence photo, for signed-in staff only.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getWaydidiAdmin())) return new Response(null, { status: 401 });
  const row = await (env.DB as unknown as { prepare: (s: string) => { bind: (...v: unknown[]) => { first: <T>() => Promise<T | null> } } })
    .prepare("SELECT file_key,mime FROM admin_evidence_photos WHERE id=?").bind((await context.params).id).first<{ file_key: string; mime: string }>();
  const file = row ? await getFile(row.file_key) : null;
  if (!row || !file) return new Response(null, { status: 404 });
  return new Response(file.body, { headers: { "Content-Type": row.mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
}
