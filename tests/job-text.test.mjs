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
  assert.equal(jobVehicleName("comfort_suv"), "SUV");
  assert.equal(jobVehicleName("premium_minivan"), "ตู้สวย");
  assert.equal(jobVehicleName("comfort_bmw"), "Comfort BMW");
});

const booking = { reference: "QCHDGW", vehicle: "comfort_suv", customerName: "Adam", customerSurname: "Campbell", passengers: 4, luggage: 4, pickupDate: "2026-10-26", pickupTime: "09:00",
  pickup: "Villa Bangkok Hotel", dropoff: "Mercure Koh Chang Hideaway", serviceType: "transfer", pricingArea: null, bookedHours: null };

test("the job message (ใบงาน) follows the owner's template, with a Google Maps link under each place", () => {
  assert.equal(driverJobText(booking, 1800), [
    "QCHDGW",
    "",
    "SUV 🚗",
    "",
    "ชื่อลูกค้า: Adam Campbell",
    "จำนวน: 4 คน, 4 กระเป๋า",
    "วันที่: 26/10/2026",
    "เวลา: 09:00",
    "รับ: Villa Bangkok Hotel",
    "https://www.google.com/maps/dir/?api=1&destination=Villa%20Bangkok%20Hotel",
    "ส่ง: Mercure Koh Chang Hideaway",
    "https://www.google.com/maps/dir/?api=1&destination=Mercure%20Koh%20Chang%20Hideaway",
    "",
    "ราคา: 1,800 บาท",
  ].join("\n"));
});

test("a map link staff set for the booking is used instead of directions; no cost shows '-'", () => {
  const text = driverJobText({ ...booking, vehicle: "premium_minivan" }, null, { pickup: "https://maps.app.goo.gl/abc", dropoff: null });
  const lines = text.split("\n");
  assert.equal(lines[2], "ตู้สวย 🚗");
  assert.equal(lines[9], "https://maps.app.goo.gl/abc");
  assert.equal(lines[11], "https://www.google.com/maps/dir/?api=1&destination=Mercure%20Koh%20Chang%20Hideaway");
  assert.equal(lines.at(-1), "ราคา: -");
});

test("an hourly booking shows the area and hours, and the same drop-off as pickup when none is set", () => {
  const text = driverJobText({ ...booking, vehicle: "economy_sedan", serviceType: "hourly", pricingArea: "Bangkok", bookedHours: 8, dropoff: "Flexible itinerary" }, 3000);
  assert.match(text, /^QCHDGW\n\nอัลติส\+ 🚗\n/);
  assert.match(text, /รับ: Villa Bangkok Hotel\nhttps:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=Villa%20Bangkok%20Hotel\nพื้นที่: Bangkok\nระยะเวลา: 8 ชั่วโมง\nส่ง: จุดเดียวกับจุดรับ\n\nราคา: 3,000 บาท$/);
});
