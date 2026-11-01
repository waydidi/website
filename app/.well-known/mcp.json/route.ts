import { env } from "cloudflare:workers";
import { discoveryResponse } from "@/lib/mcp/discovery";
export const dynamic = "force-dynamic";
export function GET() { return discoveryResponse("/.well-known/mcp.json", env.MCP_PUBLIC === "1"); }
