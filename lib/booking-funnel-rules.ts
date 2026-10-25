import { z } from "zod";

export const funnelEventSchema = z.object({
  journeyId: z.string().uuid(), eventId: z.string().uuid(),
  stage: z.enum(["quote", "details", "payment"]), service: z.enum(["transfer", "hourly"]),
}).strict();
export const funnelDeleteSchema = z.object({ journeyId: z.string().uuid() }).strict();
export type FunnelEvent = z.infer<typeof funnelEventSchema>;
export const FUNNEL_RETENTION_DAYS = 90;
export function funnelEnabled(bindings: Record<string, unknown>) {
  return bindings.BOOKING_FUNNEL_ENABLED === "1" && typeof bindings.RATE_LIMIT_SALT === "string" && bindings.RATE_LIMIT_SALT.length >= 32;
}
export function funnelDateRange(from: string, to: string) {
  const valid = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + "T00:00:00Z")) && new Date(s + "T00:00:00Z").toISOString().slice(0, 10) === s;
  if (!valid(from) || !valid(to)) return null;
  const start = Date.parse(from + "T00:00:00+07:00"), end = Date.parse(to + "T00:00:00+07:00") + 86400000;
  return end > start && end - start <= FUNNEL_RETENTION_DAYS * 86400000 ? { start: new Date(start).toISOString(), end: new Date(end).toISOString() } : null;
}
