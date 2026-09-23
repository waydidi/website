import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("emits the Cloudflare worker deployment contract", async () => {
  const worker = await readFile(
    new URL("../dist/server/index.js", import.meta.url),
    "utf8",
  );

  assert.match(worker, /export \{ worker_entry_default as default \}/);
  assert.match(worker, /async fetch\(request, env, ctx\)/);
});
