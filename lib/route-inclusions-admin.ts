import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { routeInclusions } from "@/db/schema";
import { DEFAULT_RULES } from "./route-inclusions";

export { boxFromZone, zoneFromBox, type Box } from "./route-inclusions";
import { boxFromZone, zoneFromBox } from "./route-inclusions";

const box = z.object({ south: z.number().min(-90).max(90), north: z.number().min(-90).max(90), west: z.number().min(-180).max(180), east: z.number().min(-180).max(180) })
  .refine((b) => b.north > b.south && b.east > b.west, "North must be above south and east must be right of west.");

export const ruleInputSchema = z.object({
  action: z.literal("save"),
  id: z.string().max(80).optional(),
  name: z.string().trim().min(3, "Enter a route name.").max(120),
  origin: box,
  destination: box,
  bidirectional: z.boolean(),
  includesTolls: z.boolean(),
  includesFerry: z.boolean(),
  active: z.boolean(),
  priority: z.number().int().min(0).max(1000),
});

export async function listRules() {
  const rows = await getDb().select().from(routeInclusions).orderBy(desc(routeInclusions.priority), asc(routeInclusions.name));
  return rows.map((r) => ({ ...r, origin: boxFromZone(r.originZoneJson), destination: boxFromZone(r.destinationZoneJson) }));
}

export async function saveRule(input: z.infer<typeof ruleInputSchema>) {
  const now = new Date().toISOString();
  const values = { name: input.name, originZoneJson: zoneFromBox(input.origin), destinationZoneJson: zoneFromBox(input.destination), bidirectional: input.bidirectional, includesTolls: input.includesTolls, includesFerry: input.includesFerry, active: input.active, priority: input.priority, updatedAt: now };
  if (input.id) {
    const updated = await getDb().update(routeInclusions).set(values).where(eq(routeInclusions.id, input.id)).returning({ id: routeInclusions.id });
    return updated.length ? input.id : null;
  }
  const id = crypto.randomUUID();
  await getDb().insert(routeInclusions).values({ id, ...values, createdAt: now });
  return id;
}

export async function deleteRule(id: string) {
  await getDb().delete(routeInclusions).where(eq(routeInclusions.id, id));
}

// Copies the built-in rules into the table so they can be edited. Only while it's empty:
// once the table has rows, the built-in rules stop applying.
export async function importDefaultRules() {
  const existing = await getDb().select({ id: routeInclusions.id }).from(routeInclusions).limit(1);
  if (existing.length) return 0;
  const now = new Date().toISOString();
  await getDb().insert(routeInclusions).values(DEFAULT_RULES.map((r) => ({ id: crypto.randomUUID(), ...r, createdAt: now, updatedAt: now })));
  return DEFAULT_RULES.length;
}
