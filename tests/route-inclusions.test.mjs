import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const lib = await vite.ssrLoadModule("/lib/route-inclusions.ts");

// The starting rules exactly as the migration seeds them.
const file = (await readdir(new URL("../drizzle", import.meta.url))).find((name) => name.startsWith("0031_"));
const sql = await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8");
const rules = [...sql.matchAll(/VALUES \('[^']+','([^']+)','([^']+)','([^']+)',(\d),(\d),(\d),(\d),(\d+)/g)].map((m) => ({
  name: m[1], originZoneJson: m[2], destinationZoneJson: m[3], bidirectional: m[4] === "1", includesTolls: m[5] === "1", includesFerry: m[6] === "1", active: m[7] === "1", priority: Number(m[8]),
}));

const place = {
  suvarnabhumi: { lat: 13.69, lng: 100.7501 }, donMueang: { lat: 13.9126, lng: 100.6067 }, sukhumvit: { lat: 13.7373, lng: 100.5601 },
  hiltonPattaya: { lat: 12.9346, lng: 100.8836 }, rayong: { lat: 12.6814, lng: 101.2816 }, chanthaburi: { lat: 12.6112, lng: 102.1038 },
  kohChang: { lat: 12.0833, lng: 102.3333 }, kohKood: { lat: 11.65, lng: 102.56 }, chachoengsao: { lat: 13.6904, lng: 101.0779 },
  huaHin: { lat: 12.5684, lng: 99.9577 }, chiangMai: { lat: 18.7883, lng: 98.9853 },
};

test("the migration seeds the five eastern routes", () => {
  assert.equal(rules.length, 5);
  assert.deepEqual(rules.filter((r) => r.includesFerry).map((r) => r.name), ["Bangkok ⇄ Trat, Koh Chang, Koh Kood, Koh Mak"]);
});

test("tolls are included from Bangkok and both airports to the listed destinations", () => {
  for (const from of [place.suvarnabhumi, place.donMueang, place.sukhumvit]) {
    for (const to of [place.hiltonPattaya, place.rayong, place.chanthaburi, place.kohChang, place.chachoengsao]) {
      assert.equal(lib.resolveInclusions(from, to, rules).tolls, true, JSON.stringify([from, to]));
    }
  }
});

test("the return journey is included too", () => {
  assert.equal(lib.resolveInclusions(place.hiltonPattaya, place.suvarnabhumi, rules).tolls, true);
  assert.equal(lib.resolveInclusions(place.kohKood, place.sukhumvit, rules).ferry, true);
});

test("ferry tickets only on the Trat and islands route", () => {
  assert.equal(lib.resolveInclusions(place.suvarnabhumi, place.kohChang, rules).ferry, true);
  assert.equal(lib.resolveInclusions(place.suvarnabhumi, place.hiltonPattaya, rules).ferry, false);
});

test("other routes show tolls as excluded", () => {
  for (const [a, b] of [[place.suvarnabhumi, place.huaHin], [place.sukhumvit, place.chiangMai], [place.hiltonPattaya, place.rayong]]) {
    const inclusions = lib.resolveInclusions(a, b, rules);
    assert.equal(inclusions.tolls, false);
    assert.deepEqual(lib.inclusionLines(inclusions, "en"), { included: [], excluded: ["Expressway and motorway tolls"] });
  }
});

test("inactive rules and bad data are ignored", () => {
  assert.equal(lib.resolveInclusions(place.suvarnabhumi, place.hiltonPattaya, rules.map((r) => ({ ...r, active: false }))).tolls, false);
  assert.equal(lib.resolveInclusions(place.suvarnabhumi, place.hiltonPattaya, [{ ...rules[0], destinationZoneJson: "not json" }]).tolls, false);
  assert.deepEqual(lib.parseInclusions("garbage"), lib.NO_INCLUSIONS);
});

test("messages exist in English, Thai and Chinese", () => {
  const both = { tolls: true, ferry: true, route: "x" };
  for (const locale of ["en", "th", "zh"]) assert.equal(lib.inclusionLines(both, locale).included.length, 2);
});

test("the built-in rules match the migration seed", () => {
  const strip = (r) => ({ name: r.name, o: JSON.parse(r.originZoneJson), d: JSON.parse(r.destinationZoneJson), f: r.includesFerry });
  assert.deepEqual(lib.DEFAULT_RULES.map(strip), rules.map(strip));
});

test("admin box editing round-trips and still matches routes", async () => {
  const { createServer } = await import("vite");
  const { fileURLToPath } = await import("node:url");
  const root = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
  try {
    const admin = await server.ssrLoadModule("/lib/route-inclusions.ts");
    const inc = await server.ssrLoadModule("/lib/route-inclusions.ts");
    const box = { south: 12.4, north: 12.7, west: 99.8, east: 100.1 };
    assert.deepEqual(admin.boxFromZone(admin.zoneFromBox(box)), box);
    const bangkok = inc.DEFAULT_RULES[0].originZoneJson;
    const rule = { name: "Bangkok ⇄ Hua Hin", originZoneJson: bangkok, destinationZoneJson: admin.zoneFromBox(box), bidirectional: true, includesTolls: true, includesFerry: false, active: true, priority: 50 };
    assert.equal(inc.resolveInclusions({ lat: 12.57, lng: 99.95 }, { lat: 13.69, lng: 100.75 }, [rule]).route, "Bangkok ⇄ Hua Hin");
  } finally { await server.close(); }
});
