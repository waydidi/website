export type EvidenceType = "pickup" | "dropoff";
export type EvidencePolicy = { pickup_required: number; dropoff_required: number; gps_required: number; gps_timeout_ms: number; max_accuracy_m: number; retention_days: number };
export const evidenceTypeFor = (status: string): EvidenceType | null => status === "standby" || status === "trip_started" ? "pickup" : status === "completed" ? "dropoff" : null;
export function captureAllowed(type: EvidenceType, status: string) {
  return type === "pickup" ? ["going_to_standby", "standby", "passenger_verified"].includes(status) : ["trip_started", "passenger_picked_up"].includes(status);
}
export function validEvidenceGps(lat: unknown, lng: unknown, accuracy: unknown) {
  return typeof lat === "number" && Number.isFinite(lat) && Math.abs(lat) <= 90 && typeof lng === "number" && Number.isFinite(lng) && Math.abs(lng) <= 180 && typeof accuracy === "number" && Number.isFinite(accuracy) && accuracy > 0 && accuracy <= 100000;
}
export function ictTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value)) + " ICT (UTC+7)";
}

export function freshEvidenceGps(timestamp: number, now = Date.now()) {
  const age = now - timestamp;
  return Number.isFinite(age) && age >= -1000 && age <= 5000;
}
