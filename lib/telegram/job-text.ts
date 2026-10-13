import { VEHICLES } from "@/lib/vehicles";
import { fullName } from "@/lib/person-name";
import { directionsTo } from "@/lib/maps-link";

// The names drivers use for each car class in the Thai job message.
const THAI_VEHICLE: Record<string, string> = {
  economy_sedan: "อัลติส+",
  comfort_suv: "SUV",
  premium_minivan: "ตู้สวย",
};

export const jobVehicleName = (vehicle: string) =>
  THAI_VEHICLE[vehicle] ?? (VEHICLES as Record<string, { name: string }>)[vehicle]?.name ?? vehicle.replaceAll("_", " ");

type JobBooking = {
  reference: string; vehicle: string; customerName: string; customerSurname: string | null; passengers: number; luggage: number;
  pickupDate: string; pickupTime: string; pickup: string; dropoff: string;
  serviceType: string | null; pricingArea: string | null; bookedHours: number | null;
};
/** Google Maps links staff set for the booking (Telegram 📍 buttons); without one, directions to the address. */
export type JobMaps = { pickup?: string | null; dropoff?: string | null };

/**
 * The driver job message (ใบงาน): the reference, the car, then the trip, each place followed by its
 * Google Maps link, and the driver cost. Asked for in the team group, by the assistant, and from Admin.
 */
export function driverJobText(row: JobBooking, cost: number | null | undefined, maps: JobMaps = {}) {
  const [y, m, d] = row.pickupDate.split("-");
  const hourly = row.serviceType === "hourly";
  const dropoff = hourly && (!row.dropoff || row.dropoff.startsWith("Flexible itinerary")) ? null : row.dropoff;
  return [
    row.reference,
    "",
    `${jobVehicleName(row.vehicle)} 🚗`,
    "",
    `ชื่อลูกค้า: ${fullName(row.customerName, row.customerSurname)}`,
    `จำนวน: ${row.passengers} คน, ${row.luggage} กระเป๋า`,
    `วันที่: ${d}/${m}/${y}`,
    `เวลา: ${row.pickupTime}`,
    `รับ: ${row.pickup}`,
    maps.pickup || directionsTo(row.pickup),
    ...(hourly ? [`พื้นที่: ${row.pricingArea ?? "-"}`, `ระยะเวลา: ${row.bookedHours ?? ""} ชั่วโมง`] : []),
    ...(dropoff ? [`ส่ง: ${dropoff}`, maps.dropoff || directionsTo(dropoff)] : ["ส่ง: จุดเดียวกับจุดรับ"]),
    "",
    `ราคา: ${cost ? `${cost.toLocaleString("en-US")} บาท` : "-"}`,
  ].join("\n");
}
