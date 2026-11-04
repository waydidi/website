import { env } from "cloudflare:workers";

export const multiCityEnabled = () => (env as unknown as Record<string, unknown>).MULTI_CITY_REQUESTS === "1";
