// Type for the Workers runtime module `cloudflare:workers` (provided by Cloudflare at
// runtime). Bindings (DB, BUCKET, …) and secrets are read by name from `env`.
declare module "cloudflare:workers" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const env: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class DurableObject { ctx: any; env: any; constructor(ctx: any, env: any); }
}
