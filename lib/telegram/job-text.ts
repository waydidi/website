import { VEHICLES } from "@/lib/vehicles";
import { fullName } from "@/lib/person-name";
import { isAirportPickup } from "@/lib/trip-rules";

// The names drivers use for each car class in the Thai job message.
const THAI_VEHICLE: Record<string, string> = {
  economy_sedan: "อัลติส+",
  comfort_suv: "7 ที่นั่งใหญ่",
  premium_minivan: "ตู้ VIP",
};

export const jobVehicleName = (vehicle: string) =>
  THAI_VEHICLE[vehicle] ?? (VEHICLES as Record<string, { name: string }>)[vehicle]?.name ?? vehicle.replaceAll("_", " ");

type JobBooking = {
  vehicle: string; customerName: string; customerSurname: string | null; passengers: number; luggage: number;
  pickupDate: string; pickupTime: string; flightNumber: string | null; pickup: string; dropoff: string;
  serviceType: string | null; pricingArea: string | null; bookedHours: number | null;
};

/** The driver job message (Thai labels) posted to the team Telegram group from the bookings list. */
export function driverJobText(row: JobBooking, cost: number | null | undefined) {
  const [y, m, d] = row.pickupDate.split("-");
  const flight = row.flightNumber?.trim() && isAirportPickup(row) ? row.flightNumber.trim() : "";
  return [
    `${jobVehicleName(row.vehicle)} 🚗`,
    "",
    `ชื่อลูกค้า: ${fullName(row.customerName, row.customerSurname)}`,
    `จำนวน: ${row.passengers} คน, ${row.luggage} กระเป๋า`,
    `วันที่/เวลา: ${d}/${m}/${y} ${row.pickupTime}`,
    ...(flight ? [`ไฟลท์: ${flight}`] : []),
    `รับ: ${row.pickup}`,
    ...(row.serviceType === "hourly" ? [`พื้นที่: ${row.pricingArea ?? "-"}`, `ระยะเวลา: ${row.bookedHours ?? ""} ชั่วโมง`] : []),
    `ส่ง: ${row.serviceType === "hourly" ? (row.dropoff && !row.dropoff.startsWith("Flexible itinerary") ? row.dropoff : "จุดเดียวกับจุดรับ") : row.dropoff}`,
    `ราคา: ${cost ? `${cost.toLocaleString("en-US")} บาท` : "-"}`,
  ].join("\n");
}
