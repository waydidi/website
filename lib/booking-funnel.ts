import { env } from "cloudflare:workers";
import { permitsAnalytics } from "./privacy-consent";
import { funnelEnabled } from "./booking-funnel-rules";
import { confirmFunnelBooking, linkFunnelBooking } from "./booking-funnel-db";

export function requestPermitsFunnel(request: Request) {
  return permitsAnalytics(request.headers.get("cookie") ?? "", request.headers.get("dnt"), request.headers.get("sec-gpc"));
}
// Optional telemetry must never make checkout or fulfillment fail.
export async function observeFunnelBooking(request: Request, id: string | undefined, reference: string, service: string) {
  if (!id || !funnelEnabled(env) || !requestPermitsFunnel(request)) return;
  try { await linkFunnelBooking(env.DB, env.RATE_LIMIT_SALT, id, reference, service); }
  catch { console.error("Booking funnel link failed"); }
}
export async function observeFunnelConfirmation(reference: string) {
  if (!funnelEnabled(env)) return;
  try { await confirmFunnelBooking(env.DB, env.RATE_LIMIT_SALT, reference); }
  catch { console.error("Booking funnel confirmation failed"); }
}
