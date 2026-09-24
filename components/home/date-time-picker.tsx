"use client";

import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { dateFromValue, dateValue, formatTimeLabel, pickupTimes } from "./dates";
import { formatDate, intlLocale } from "@/lib/i18n";
import { useI18n } from "@/components/i18n-provider";

export function DateTimePicker({
  open,
  kind,
  date,
  time,
  onDateChange,
  onTimeChange,
  onOpenChange,
  onDone,
  min,
  minTime,
}: {
  open: boolean;
  kind: "departure" | "return";
  date: string;
  time: string;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
  min?: string;
  minTime?: string;
}) {
  const { locale, t } = useI18n();
  const departure = kind === "departure";
  const title = t(departure ? "picker.departure" : "picker.return");
  const selected = dateFromValue(date);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1),
  );
  const moveMonth = (amount: number) =>
    setVisibleMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + amount, 1),
    );
  // A slot only counts as past when the chosen day is the earliest allowed one.
  const earliestTime = min && date === min ? minTime : undefined;
  const selectableTimes = earliestTime
    ? pickupTimes.filter((option) => option.value >= earliestTime)
    : pickupTimes;
  // Moving to today can strip the slot that was already chosen; show and commit
  // the earliest still-bookable one rather than an empty select.
  const effectiveTime = selectableTimes.some((option) => option.value === time)
    ? time
    : selectableTimes[0]?.value ?? time;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[96dvh] overflow-y-auto rounded-t-[32px] border-0 bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 text-ink data-[state=open]:duration-500 motion-reduce:duration-0 sm:px-8 lg:left-1/2 lg:max-w-3xl lg:-translate-x-1/2"
      >
        <div className="mx-auto h-1.5 w-16 rounded-full bg-slate-300" aria-hidden="true" />
        <SheetHeader className="flex-row items-center justify-between px-0 pb-3 pt-5 text-left">
          <SheetTitle className="text-[28px] font-semibold tracking-[-.03em] sm:text-[34px]">
            {title}
          </SheetTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="grid size-12 place-items-center rounded-full bg-slate-100 text-brand-deep transition hover:bg-orange-50"
            aria-label={t(departure ? "picker.closeDeparture" : "picker.closeReturn")}
          >
            <X size={25} />
          </button>
        </SheetHeader>
        <div className="py-2 sm:px-4">
          <CalendarMonth
            month={visibleMonth}
            selected={date}
            onSelect={onDateChange}
            onPrevious={() => moveMonth(-1)}
            onNext={() => moveMonth(1)}
            min={min}
          />
        </div>
        <div className="mt-5 grid overflow-hidden rounded-2xl border border-slate-200 grid-cols-2">
          <div className="px-5 py-3">
            <span className="block text-sm font-semibold text-slate-500">
              {t(departure ? "picker.departureDate" : "picker.returnDate")}
            </span>
            <strong className="font-semibold">{formatDate(date)}</strong>
          </div>
          <label className="bg-slate-100 px-5 py-3">
            <span className="block text-sm font-semibold text-slate-500">
              {t(departure ? "picker.departureTime" : "picker.returnTime")}
            </span>
            <select
              value={effectiveTime}
              onChange={(event) => onTimeChange(event.target.value)}
              className="w-full bg-transparent text-[16px] font-semibold outline-none"
            >
              {selectableTimes.map((option) => (
                <option key={option.value} value={option.value}>
                  {formatTimeLabel(option.value, locale)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => {
            if (effectiveTime !== time) onTimeChange(effectiveTime);
            onDone();
          }}
          className="mt-6 min-h-14 w-full rounded-full bg-brand px-7 text-lg font-bold text-ink transition hover:bg-brand-hover"
        >
          {t("common.done")}
        </button>
      </SheetContent>
    </Sheet>
  );
}

function CalendarMonth({
  month,
  selected,
  onSelect,
  onPrevious,
  onNext,
  nextMobileOnly = false,
  min,
}: {
  month: Date;
  selected: string;
  onSelect: (value: string) => void;
  onPrevious?: () => void;
  onNext?: () => void;
  nextMobileOnly?: boolean;
  min?: string;
}) {
  const { locale, t } = useI18n();
  // 4 January 2026 is a Sunday; the grid starts on Sunday.
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Date(2026, 0, 4 + index).toLocaleDateString(intlLocale(locale), { weekday: "short" }),
  );
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const daysInMonth = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1;
    return day >= 1 && day <= daysInMonth ? day : null;
  });
  // Day 0 of this month is the last day of the previous one. If even that sits
  // before the minimum, there is nothing selectable back there.
  const atMinMonth = Boolean(
    min && dateValue(new Date(month.getFullYear(), month.getMonth(), 0)) < min,
  );

  return (
    <div>
      <div className="mb-5 grid grid-cols-[44px_1fr_44px] items-center">
        {onPrevious ? (
          <button
            type="button"
            onClick={onPrevious}
            disabled={atMinMonth}
            className="grid size-11 place-items-center rounded-full bg-slate-100 transition disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-300"
            aria-label={t("picker.previousMonth")}
          >
            <ArrowLeft size={20} />
          </button>
        ) : (
          <span />
        )}
        <h3 className="text-center text-xl font-bold">
          {month.toLocaleDateString(intlLocale(locale), {
            month: "long",
            year: "numeric",
          })}
        </h3>
        {onNext ? (
          <button
            type="button"
            onClick={onNext}
            className={`grid size-11 place-items-center rounded-full bg-slate-100 ${nextMobileOnly ? "md:hidden" : ""}`}
            aria-label={t("picker.nextMonth")}
          >
            <ArrowRight size={20} />
          </button>
        ) : (
          <span />
        )}
      </div>
      <div className="grid grid-cols-7 text-center text-sm font-bold">
        {weekdays.map((day) => (
          <span key={day} className="py-2">
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {cells.map((day, index) =>
          day ? (
            (() => {
              const value = dateValue(
                new Date(month.getFullYear(), month.getMonth(), day),
              );
              const active = value === selected;
              const disabled = Boolean(min) && value < min!;
              return (
                <button
                  type="button"
                  key={value}
                  disabled={disabled}
                  aria-disabled={disabled}
                  onClick={() => onSelect(value)}
                  className={`mx-auto grid size-10 place-items-center rounded-full text-[16px] transition ${active ? "bg-brand font-bold text-ink" : disabled ? "cursor-not-allowed text-slate-300" : "hover:bg-orange-100"}`}
                >
                  {day}
                </button>
              );
            })()
          ) : (
            <span key={`empty-${index}`} className="size-10" />
          ),
        )}
      </div>
    </div>
  );
}
