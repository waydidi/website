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

export function formatDateLabel(value: string) {
  return dateFromValue(value).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatCompactDate(value: string) {
  return dateFromValue(value).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatTimeLabel(value: string) {
  const option = pickupTimes.find((item) => item.value === value);
  return option?.label ?? value;
}
