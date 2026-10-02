"use client";

import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { DateTimePicker } from "@/components/home/date-time-picker";

const LONG = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

// Date and time field that opens the homepage date picker (bottom sheet on phones, centred popup on larger screens).
export function DateField({ value, onChange, time, onTimeChange, min, kind = "departure", disabled, className }: {
  value: string; onChange: (v: string) => void; time: string; onTimeChange: (v: string) => void;
  min: string; kind?: "departure" | "return"; disabled?: boolean; className: string;
}) {
  const [open, setOpen] = useState(false);
  const clock = (t: string) => { const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`; };
  const shown = value ? `${LONG.format(new Date(`${value}T00:00:00Z`))}${time ? ` · ${clock(time)}` : ""}` : "";
  return <>
    <button type="button" disabled={disabled} onClick={() => { if (!value || value < min) onChange(min); setOpen(true); }}
      className={`${className} relative flex items-center text-left ${shown ? "" : "text-[#BDB2A8]"}`}>
      {shown || "Select date & time"}
      <CalendarDays size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[#9A8F86]" aria-hidden="true" />
    </button>
    {open && <DateTimePicker open={open} kind={kind} date={value || min} time={time || "09:00"} min={min}
      onDateChange={onChange} onTimeChange={onTimeChange} onOpenChange={setOpen} onDone={() => { if (!time) onTimeChange("09:00"); setOpen(false); }} />}
  </>;
}
