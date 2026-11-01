import { z } from "zod";
import { toolDefinitions, validateTool } from "./schemas";

export type Resource = { uri: string; name: string; mimeType: string; text: string };
export type McpDependencies = {
  enabled: boolean;
  allow: (bucket: "request" | "quote") => Promise<boolean>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  resources: Resource[];
};
// MCP allows an optional `_meta` object on every request's params (progressToken, openai/* keys).
const meta = z.record(z.unknown()).optional();
const envelope = z.object({ jsonrpc: z.literal("2.0"), id: z.union([z.string(), z.number().finite(), z.null()]).optional(), method: z.string(), params: z.record(z.unknown()).optional() }).strict();
export const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version", "Cache-Control": "no-store" };
export async function handleMcp(request: Request, deps: McpDependencies): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: CORS });
  const error = (id: unknown, code: number, message: string, status = 200) => json({ jsonrpc: "2.0", id, error: { code, message } }, status);
  if (!deps.enabled) return new Response(null, { status: 404, headers: CORS });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
  try { if (!await deps.allow("request")) return error(null, -32029, "Rate limit exceeded", 429); }
  catch { return error(null, -32603, "Service unavailable", 503); }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return error(null, -32600, "Expected application/json", 415);
  // Bound memory and reject batches explicitly; there are no sessions or streams.
  if (Number(request.headers.get("content-length")) > 16384) return error(null, -32600, "Request too large", 413);
  let body: unknown;
  try { const text = await request.text(); if (text.length > 16384) return error(null, -32600, "Request too large", 413); body = JSON.parse(text); }
  catch { return error(null, -32700, "Parse error", 400); }
  const parsed = envelope.safeParse(body);
  if (!parsed.success) return error(null, -32600, "Invalid request (batches are not supported)", 400);
  const { id, method, params = {} } = parsed.data;
  const notification = id === undefined;
  const result = (value: unknown) => notification ? new Response(null, { status: 202, headers: CORS }) : json({ jsonrpc: "2.0", id, result: value });
  if (notification) return new Response(null, { status: 202, headers: CORS });
  try {
    switch (method) {
      case "initialize": {
        const init = z.object({ protocolVersion: z.string(), capabilities: z.record(z.unknown()), clientInfo: z.object({ name: z.string(), version: z.string() }).passthrough() }).passthrough().safeParse(params);
        if (!init.success) return error(id, -32602, "Invalid initialize parameters");
        const supported = ["2025-03-26", "2025-06-18", "2025-11-25"];
        return result({ protocolVersion: supported.includes(init.data.protocolVersion) ? init.data.protocolVersion : "2025-03-26", capabilities: { tools: {}, resources: {} }, serverInfo: { name: "Waydidi", version: "1.0.0" }, instructions: "Read-only travel estimates. The traveler reviews and confirms the current price on waydidi.com. Never request payment or personal details here." });
      }
      case "ping": return result({});
      case "tools/list": return result({ tools: toolDefinitions });
      case "tools/call": {
        const call = z.object({ name: z.string(), arguments: z.record(z.unknown()).default({}), _meta: meta }).strict().safeParse(params);
        if (!call.success) return error(id, -32602, "Invalid tool call");
        const args = validateTool(call.data.name, call.data.arguments);
        if (!args.success) return error(id, -32602, "Unknown tool or invalid arguments");
        if (call.data.name === "get_quote" && !await deps.allow("quote")) return error(id, -32029, "Quote rate limit exceeded", 429);
        try {
          const data = await deps.callTool(call.data.name, args.data);
          return result({ content: [{ type: "text", text: JSON.stringify(data) }], structuredContent: data });
        } catch { return result({ isError: true, content: [{ type: "text", text: "Quote unavailable. Review your route on https://waydidi.com or contact support." }] }); }
      }
      case "resources/list": return result({ resources: deps.resources.map(({ uri, name, mimeType }) => ({ uri, name, mimeType })) });
      case "resources/read": {
        const read = z.object({ uri: z.string(), _meta: meta }).strict().safeParse(params);
        if (!read.success) return error(id, -32602, "Invalid resource parameters");
        const resource = deps.resources.find(r => r.uri === read.data.uri);
        if (!resource) return error(id, -32002, "Resource not found");
        return result({ contents: [{ uri: resource.uri, mimeType: resource.mimeType, text: resource.text }] });
      }
      default: return error(id, -32601, "Method not found");
    }
  } catch { return error(id, -32603, "Service unavailable"); }
}
