import { env } from "cloudflare:workers";

/** Sales Intelligence PR 4 (multi-leg quotes, file reading, vehicle needs, itinerary drafts). Off unless exactly "1". */
export const salesMediaOn = () => (env as unknown as Record<string, string | undefined>).SALES_AI_MEDIA === "1";
