import { spawn } from "node:child_process";
import { mkdir, open, readFile, readdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const portable = process.platform !== "linux";
const [task, ...args] = process.argv.slice(2);
const environment = { ...process.env };
environment.WRANGLER_WRITE_LOGS ??= "false";
environment.WRANGLER_LOG_PATH ??= join(root, ".wrangler", "logs");
environment.MINIFLARE_REGISTRY_PATH ??= join(root, ".wrangler", "registry");

function duration(value, fallback) {
  if (!value) return fallback;
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h)?$/.exec(value);
  const scale = { ms: 1, s: 1000, m: 60000, h: 3600000 };
  const result = match && Number(match[1]) * scale[match[2] ?? "s"];
  if (!result || !Number.isSafeInteger(result) || result > 86400000) throw new Error("Use a positive timeout up to 24 hours, e.g. 30s or 10m.");
  return result;
}

async function run(command, argv, timeout = 0) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, argv, { cwd: root, env: environment, stdio: "inherit", shell: false, windowsHide: true });
    let resultOverride, timer, forceTimer;
    const stop = code => {
      if (resultOverride !== undefined) return;
      resultOverride = code;
      if (process.platform === "win32" && child.pid) {
        // Stop only this task's process tree, including its compiler workers.
        const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
        killer.on("error", () => child.kill());
      } else {
        child.kill("SIGTERM");
        forceTimer = setTimeout(() => child.kill("SIGKILL"), 10000);
        forceTimer.unref();
      }
    };
    const interrupt = () => stop(130), terminate = () => stop(143);
    process.once("SIGINT", interrupt); process.once("SIGTERM", terminate);
    if (timeout) timer = setTimeout(() => { console.error(`Task exceeded ${Math.round(timeout / 1000)} seconds.`); stop(124); }, timeout);
    const cleanup = () => { clearTimeout(timer); clearTimeout(forceTimer); process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", terminate); };
    child.once("error", error => { cleanup(); reject(error); });
    child.once("close", (code, signal) => { cleanup(); resolveRun(resultOverride ?? code ?? (signal ? 1 : 0)); });
  });
}
const node = (entry, argv = [], timeout = 0) => run(process.execPath, [join(root, "node_modules", entry), ...argv], timeout);
async function build(buildArgs = args) {
  return portable
    ? node("vinext/dist/cli.js", ["build", ...buildArgs], duration(process.env.SITES_BUILD_TIMEOUT, 600000))
    : run("bash", ["scripts/build-verified.sh", ...buildArgs]);
}
async function install() {
  if (!portable) return run("bash", ["scripts/install-ci.sh", ...args]);
  if (!process.env.npm_execpath) throw new Error("Run this task with npm.cmd run install:ci (Windows) or npm run install:ci.");
  const lockPath = join(root, ".wrangler", "install.lock");
  await mkdir(dirname(lockPath), { recursive: true });
  let lock;
  try { lock = await open(lockPath, "wx"); }
  catch (error) {
    if (error.code === "EEXIST") throw new Error("An install lock exists in .wrangler/install.lock. Finish the other install; after an interrupted task, verify it stopped before removing this file.");
    throw error;
  }
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }) + "\n");
    const code = await run(process.execPath, [process.env.npm_execpath, "ci", "--fetch-retries=0", "--fetch-timeout=30000", "--maxsockets=1", ...args], duration(process.env.SITES_INSTALL_TIMEOUT, 480000));
    if (code) return code;
    // npm verifies lockfile integrity; also verify the required executable exists.
    await readFile(join(root, "node_modules", "vinext", "dist", "cli.js"));
    return 0;
  } finally { await lock.close(); await unlink(lockPath); }
}
async function tests(withBuild, ci = false) {
  if (withBuild) { const code = await build([]); if (code) return code; }
  const files = args.length ? args : (await readdir(join(root, "tests"))).filter(name => name.endsWith(".test.mjs")).sort().map(name => join("tests", name));
  const reporters = ci ? ["--test-reporter=spec", "--test-reporter-destination=stdout", "--test-reporter=./tests/helpers/github-reporter.mjs", "--test-reporter-destination=stdout"] : [];
  return run(process.execPath, ["--test", "--test-concurrency=1", ...reporters, ...files]);
}
async function main() {
  switch (task) {
    case "dev": return node("vite/bin/vite.js", args);
    case "start": return node("vinext/dist/cli.js", ["start", ...args]);
    case "build": return build();
    case "install:ci": return install();
    case "lint": return portable
      ? node("eslint/bin/eslint.js", [".", "--ignore-pattern", "dist", "--ignore-pattern", ".next", ...args])
      : run("bash", ["scripts/sites-env.sh", "--", "eslint", ".", "--ignore-pattern", "dist", "--ignore-pattern", ".next", ...args]);
    case "db:generate": return portable ? node("drizzle-kit/bin.cjs", ["generate", ...args]) : run("bash", ["scripts/sites-env.sh", "--", "drizzle-kit", "generate", ...args]);
    case "test": return tests(true);
    case "test:ci": return tests(true, true);
    case "test:unit": return tests(false);
    default: throw new Error("Choose dev, start, build, install:ci, lint, db:generate, test, test:ci or test:unit.");
  }
}
try { process.exitCode = await main(); }
catch (error) { console.error(error instanceof Error ? error.message : "Task failed."); process.exitCode = 1; }
