import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("emits the Cloudflare worker deployment contract", async () => {
  const worker = await readFile(
    new URL("../dist/server/index.js", import.meta.url),
    "utf8",
  );

  assert.match(worker, /export \{[^}]*\bworker_entry_default as default\b[^}]*\}/);
  // Non's per-chat Durable Object class must be exported for its binding.
  assert.match(worker, /export \{[^}]*\bNonChat\b[^}]*\}/);
  assert.match(worker, /async fetch\(request, env, ctx\)/);
});
