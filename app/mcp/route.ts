import { env } from "cloudflare:workers";
import { handleMcp } from "@/lib/mcp/protocol";
import { allowMcp } from "@/lib/mcp/rate-limit";
import { callPublicTool, resources } from "@/lib/mcp/tools";
import type { SecurityDatabase } from "@/lib/worker-db";
export const dynamic = "force-dynamic";
function handle(request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
  return handleMcp(request, {
    enabled: env.MCP_PUBLIC === "1",
    allow: bucket => allowMcp(env.DB as SecurityDatabase, env.RATE_LIMIT_SALT ?? "", ip, bucket),
    callTool: (name, args) => callPublicTool(name, args, ip), resources,
  });
}
export const POST = handle;
export const GET = handle;
export const OPTIONS = handle;
