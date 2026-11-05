import { z } from "zod";
import { ERROR_TYPES, MONITORED_ROUTES, MONITORING_FILE_PATTERN, MONITORING_POSITION_MAX, MONITORING_VALUE_MAX, VITAL_NAMES } from "./web-monitoring-rules";

const device = z.enum(["mobile", "desktop"]);
const position = z.number().int().min(0).max(MONITORING_POSITION_MAX).nullable();
const vitalSchema = z.object({
  kind: z.literal("vital"),
  route: z.enum(MONITORED_ROUTES),
  name: z.enum(VITAL_NAMES),
  // Milliseconds; CLS is stored multiplied by 1000 so every value is an integer.
  value: z.number().int().min(0).max(MONITORING_VALUE_MAX),
  device,
  connection: z.enum(["slow-2g", "2g", "3g", "4g", "unknown"]),
}).strict();
const errorSchema = z.object({
  kind: z.literal("error"),
  route: z.enum(MONITORED_ROUTES),
  errorType: z.enum(ERROR_TYPES),
  // A built script's file name and position, enough to find the code. Never a message or stack.
  file: z.string().regex(MONITORING_FILE_PATTERN).nullable(),
  line: position,
  column: position,
  device,
}).strict();
export const webMonitoringBatchSchema = z.object({ events: z.array(z.discriminatedUnion("kind", [vitalSchema, errorSchema])).min(1).max(10) }).strict();
export type WebMonitoringEvent = z.infer<typeof webMonitoringBatchSchema>["events"][number];
