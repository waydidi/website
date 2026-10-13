// "Set cost" for many bookings in one team-group message. Pure (unit tested in tests/telegram-driver-group.test.mjs).
//
//   ราคา
//   FMBNUW 1800
//   52LLDS 2,200 บาท
//
// The first word is "ราคา", "ตั้งราคา", "cost" or "/cost"; then one booking reference and its driver cost
// in THB per line (or several on one line, separated by commas).

export const MAX_BULK_COSTS = 20;
export const MAX_DRIVER_COST = 500_000;

export type BulkCostLine = { reference: string; cost: number };
export type BulkCost = { items: BulkCostLine[]; invalid: string[] };

export function parseBulkCost(text: string): BulkCost | null {
  const m = text.trim().match(/^(?:\/cost(?:@\w+)?|cost|ราคา|ตั้งราคา)(?=\s|$)([\s\S]*)$/i);
  if (!m) return null;
  const items: BulkCostLine[] = [], invalid: string[] = [];
  const seen = new Set<string>();
  for (const part of m[1].split(/[\n,;]+(?![0-9]{3}\b)/).map((s) => s.trim()).filter(Boolean)) {
    const pair = part.match(/^([A-Za-z0-9-]{4,24})\s*[:=\-–]?\s*(?:฿\s*)?([0-9][0-9,]*)\s*(?:บาท|thb|฿)?$/i);
    const cost = pair ? Number(pair[2].replaceAll(",", "")) : NaN;
    if (!pair || !Number.isInteger(cost) || cost <= 0 || cost > MAX_DRIVER_COST) { invalid.push(part.slice(0, 40)); continue; }
    const reference = pair[1].toUpperCase();
    if (seen.has(reference)) items.splice(items.findIndex((i) => i.reference === reference), 1);
    seen.add(reference);
    items.push({ reference, cost });
  }
  return { items: items.slice(0, MAX_BULK_COSTS), invalid: [...invalid, ...items.slice(MAX_BULK_COSTS).map((i) => i.reference)] };
}
