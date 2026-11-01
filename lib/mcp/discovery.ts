import { toolDefinitions } from "./schemas";
const llms = `# Waydidi Travel
Private transfers, airport transfers, hourly cars with drivers, and tours in Thailand.
Prices and checkout are in Thai baht (THB). Other currency displays are indicative.

Book: https://waydidi.com/ — choose exact addresses, date/time, passengers and bags; review a vehicle and current price, then complete checkout yourself.
Public read-only MCP: https://waydidi.com/mcp (POST; stateless JSON responses; no authentication or SSE).
Tools: search_places, get_quote, get_booking_link. These do not reserve, pay or create bookings. Do not send customer names, contact details or payment information to MCP.
Quotes require a pickup at least three hours ahead, within two years, on a 15-minute slot (Asia/Bangkok). Final availability and price are rechecked on the website.

Refunds and cancellation: https://waydidi.com/refund-policy
Terms: https://waydidi.com/terms
Privacy: https://waydidi.com/privacy
Contact: https://waydidi.com/contact
`;
export function discoveryResponse(path: string, enabled: boolean) {
  const headers = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };
  if (!enabled) return new Response(null, { status: 404, headers });
  if (path === "/llms.txt") return new Response(llms, { headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" } });
  return Response.json({ name: "Waydidi", version: "1.0.0", endpoint: "https://waydidi.com/mcp", transport: "streamable-http", authentication: "none", tools: toolDefinitions.map(t => t.name), readOnly: true }, { headers });
}
