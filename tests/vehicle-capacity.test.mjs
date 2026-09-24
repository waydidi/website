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

const { VEHICLES, vehicleFits, smallestFittingVehicle } = await vite.ssrLoadModule("/lib/vehicles.ts");
const { checkoutInputSchema } = await vite.ssrLoadModule("/lib/booking-validation.ts");

test("every vehicle declares seats and bags", () => {
  for (const [id, vehicle] of Object.entries(VEHICLES)) {
    assert.ok(Number.isInteger(vehicle.passengers) && vehicle.passengers > 0, `${id} passengers`);
    assert.ok(Number.isInteger(vehicle.bags) && vehicle.bags >= 0, `${id} bags`);
  }
});

test("a vehicle fits a group up to its capacity and not beyond", () => {
  const sedan = VEHICLES.economy_sedan;
  assert.equal(vehicleFits("economy_sedan", sedan.passengers, sedan.bags), true);
  assert.equal(vehicleFits("economy_sedan", sedan.passengers + 1, sedan.bags), false);
  assert.equal(vehicleFits("economy_sedan", sedan.passengers, sedan.bags + 1), false);
});

test("the smallest fitting vehicle is chosen, and none when the group is too large", () => {
  assert.equal(smallestFittingVehicle(2, 2), "economy_sedan");
  assert.equal(smallestFittingVehicle(4, 4), "comfort_suv");
  assert.equal(smallestFittingVehicle(6, 6), "premium_minivan");
  const largest = Math.max(...Object.values(VEHICLES).map((vehicle) => vehicle.passengers));
  assert.equal(smallestFittingVehicle(largest + 1, 0), null);
});

test("the largest vehicle carries the biggest group checkout accepts", () => {
  // Checkout validation caps passengers; some vehicle must carry that many.
  // superRefine wraps the object schema; its fields sit on the inner type.
  const passengerCap = checkoutInputSchema.innerType().shape.passengers.maxValue;
  assert.ok(Number.isInteger(passengerCap));
  assert.ok(smallestFittingVehicle(passengerCap, 0) !== null, `no vehicle carries ${passengerCap} passengers`);
});
