import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => vite.close());
const { driverJobText, jobVehicleName } = await vite.ssrLoadModule("/lib/telegram/job-text.ts");

test("driver job messages use the drivers' names for each car class", () => {
  assert.equal(jobVehicleName("economy_sedan"), "อัลติส+");
  assert.equal(jobVehicleName("comfort_suv"), "7 ที่นั่งใหญ่");
  assert.equal(jobVehicleName("premium_minivan"), "ตู้ VIP");
  assert.equal(jobVehicleName("comfort_bmw"), "Comfort BMW");
});

test("the job message starts with the car and lists the trip", () => {
  const text = driverJobText({ vehicle: "comfort_suv", customerName: "Anna", customerSurname: "Smith", passengers: 3, luggage: 2, pickupDate: "2026-10-12", pickupTime: "09:30",
    flightNumber: "TG 600", pickup: "Suvarnabhumi Airport (BKK)", dropoff: "Hilton Pattaya", serviceType: "transfer", pricingArea: null, bookedHours: null }, 1500);
  const lines = text.split("\n");
  assert.equal(lines[0], "7 ที่นั่งใหญ่ 🚗");
  assert.ok(lines.includes("ชื่อลูกค้า: Anna Smith"));
  assert.ok(lines.includes("วันที่/เวลา: 12/10/2026 09:30"));
  assert.ok(lines.includes("ไฟลท์: TG 600"));
  assert.ok(lines.includes("ราคา: 1,500 บาท"));
});
