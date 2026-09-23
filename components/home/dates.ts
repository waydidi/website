import type { Locale } from "@/lib/i18n";

export const pickupTimes = Array.from({ length: 96 }, (_, index) => {
  const hours = Math.floor(index / 4);
  const minutes = (index % 4) * 15;
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const displayHour = hours % 12 || 12;
  return {
    value,
    label: `${displayHour}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "am" : "pm"}`,
  };
});

export function dateFromValue(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// English reads 12-hour; Thai and Chinese readers expect the 24-hour clock.
export function formatTimeLabel(value: string, locale: Locale = "en") {
  if (locale !== "en") return value;
  const option = pickupTimes.find((item) => item.value === value);
  return option?.label ?? value;
}
