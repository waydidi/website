import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true },
});

after(async () => vite.close());

const { destinationMarkers, thailandDotColumnsByRow, MAP_ORIGIN } = await vite.ssrLoadModule(
  "/components/home/destination-map.tsx",
);

const trueCell = ({ lat, lng }) => ({
  row: (MAP_ORIGIN.lat - lat) / MAP_ORIGIN.degreesPerDot,
  column: (lng - MAP_ORIGIN.lng) / MAP_ORIGIN.degreesPerDot,
});

test("the grid's extremes are Thailand's", () => {
  // Mae Sai, the northern tip, and the southern tip near Betong.
  assert.ok(thailandDotColumnsByRow[0].some((column) => Math.abs(MAP_ORIGIN.lng + column * MAP_ORIGIN.degreesPerDot - 99.9) < 0.4));
  const south = MAP_ORIGIN.lat - (thailandDotColumnsByRow.length - 1) * MAP_ORIGIN.degreesPerDot;
  assert.ok(Math.abs(south - 5.61) < 0.35, `southern tip at ${south.toFixed(2)}°N`);
});

for (const marker of destinationMarkers) {
  test(`${marker.name} sits on a grey dot within one dot of its real location`, () => {
    assert.ok(
      thailandDotColumnsByRow[marker.row]?.includes(marker.column),
      `no dot at row ${marker.row}, column ${marker.column}`,
    );
    const { row, column } = trueCell(marker);
    const off = Math.hypot(marker.row - row, marker.column - column);
    assert.ok(off <= 1, `${off.toFixed(2)} dots from ${marker.lat}, ${marker.lng}`);
  });
}

test("no two markers sit on neighbouring dots, where their circles would overlap", () => {
  for (const [i, a] of destinationMarkers.entries()) {
    for (const b of destinationMarkers.slice(i + 1)) {
      const distance = Math.hypot(a.row - b.row, a.column - b.column);
      assert.ok(distance >= Math.SQRT2, `${a.name} and ${b.name} overlap`);
    }
  }
});
