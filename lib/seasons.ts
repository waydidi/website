import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { priceSeasons } from "@/db/schema";

export type Season = typeof priceSeasons.$inferSelect;
export type SeasonContext = { service: "transfer" | "hourly"; areaId?: string | null; vehicleId?: string };

const list = (json: string | null) => { try { const v = JSON.parse(json ?? "null"); return Array.isArray(v) ? v.map(String) : null; } catch { return null; } };

/** Does the season cover this pickup date (YYYY-MM-DD)? Yearly seasons use MM-DD and may wrap over New Year. */
export function seasonCovers(season: Pick<Season, "startsOn" | "endsOn" | "repeatsYearly">, date: string) {
  if (!season.repeatsYearly) return date >= season.startsOn && date <= season.endsOn;
  const day = date.slice(5);
  return season.startsOn <= season.endsOn ? day >= season.startsOn && day <= season.endsOn : day >= season.startsOn || day <= season.endsOn;
}

const applies = (s: Season, date: string, ctx: SeasonContext) => s.active && seasonCovers(s, date)
  && (s.service === "all" || s.service === ctx.service)
  && (!list(s.areaIds) || (ctx.areaId != null && list(s.areaIds)!.includes(ctx.areaId)))
  && (!list(s.vehicleIds) || (ctx.vehicleId != null && list(s.vehicleIds)!.includes(ctx.vehicleId)));

const adjusted = (s: Season, price: number) => s.adjustmentType === "fixed" ? price + s.adjustment : price * (1 + s.adjustment / 100);

/** Price after the season for that date; when several seasons match, only the highest applies. Rounded up to 50 THB. */
export function seasonalPrice(price: number, date: string, ctx: SeasonContext, seasons: Season[]) {
  const matching = seasons.filter((s) => applies(s, date, ctx));
  if (!matching.length) return { total: price, season: null as Season | null };
  const best = matching.reduce((a, b) => (adjusted(b, price) > adjusted(a, price) ? b : a));
  const raw = adjusted(best, price);
  if (raw === price) return { total: price, season: best };
  return { total: Math.max(0, Math.ceil(raw / 50) * 50), season: best };
}

export async function loadSeasons() {
  return getDb().select().from(priceSeasons).where(eq(priceSeasons.active, true)).catch(() => [] as Season[]);
}

/** Apply seasons to a quote's vehicle prices ({ vehicle: { total, ... } }). */
export async function withSeason<T extends { total: number }>(prices: Record<string, T>, date: string, ctx: Omit<SeasonContext, "vehicleId">) {
  const seasons = await loadSeasons();
  if (!seasons.length) return prices;
  return Object.fromEntries(Object.entries(prices).map(([vehicleId, p]) => {
    const { total, season } = seasonalPrice(p.total, date, { ...ctx, vehicleId }, seasons);
    if (!season || total === p.total) return [vehicleId, p];
    // The season moves the base price too, so base + surcharges still add up to the total.
    const base = (p as { basePrice?: number }).basePrice;
    return [vehicleId, { ...p, total, ...(typeof base === "number" ? { basePrice: base + total - p.total } : {}), seasonName: season.name, seasonAdjustment: total - p.total }];
  })) as Record<string, T>;
}
