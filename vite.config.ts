import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

// Must match the Worker connected to this repo in Cloudflare Workers Builds,
// or every Git build fails before it deploys.
const WORKER_NAME = "waydidi-website";

// The production D1 database bound to that Worker as DB. Not a secret: the ID
// only resolves inside the owning Cloudflare account.
const D1_DATABASE_NAME = "waydidi-website-db";
const D1_DATABASE_ID = "604fb8a6-cdac-4b81-9e3b-63e170d23da8";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

// R2 is not enabled on the production account, and deploying a binding to a
// bucket that does not exist fails the deploy. Local dev keeps an emulated
// bucket; a build binds a real one only when R2_BUCKET_NAME names it. Every
// BUCKET use in the app already degrades when the binding is absent.
function bindingConfig(command: "build" | "serve") {
  const r2BucketName =
    command === "build" ? process.env.R2_BUCKET_NAME : "site-creator-r2";
  return {
    name: WORKER_NAME,
    main: "./worker/index.ts",
    compatibility_flags: ["nodejs_compat"],
    // Keep variables set in the Cloudflare dashboard across Git deploys;
    // without this, wrangler deploy deletes any not declared here.
    keep_vars: true,
    d1_databases: d1
      ? [
          {
            binding: d1,
            database_name: D1_DATABASE_NAME,
            database_id: D1_DATABASE_ID,
          },
        ]
      : [],
    r2_buckets:
      r2 && r2BucketName ? [{ binding: r2, bucket_name: r2BucketName }] : [],
  };
}

export default defineConfig(async ({ command }) => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "0.0.0.0",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: bindingConfig(command),
      }),
    ],
  };
});
