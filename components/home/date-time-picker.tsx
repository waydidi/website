"use client";

import { ArrowLeft, ArrowRight, ChevronDown, X } from "lucide-react";
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
        className="max-h-[96dvh] overflow-y-auto rounded-t-[32px] border-0 bg-white px-5 pb-[max(24px,env(safe-area-inset-bottom))] pt-3 text-ink data-[state=open]:duration-500 motion-reduce:duration-0 sm:px-8 md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[92dvh] md:w-[min(94vw,880px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[32px] md:px-8 md:pb-6 md:pt-8 md:shadow-2xl md:data-[state=open]:slide-in-from-bottom-0 md:data-[state=closed]:slide-out-to-bottom-0 md:data-[state=open]:zoom-in-95 md:data-[state=closed]:zoom-out-95 md:data-[state=open]:duration-200"
      >
        {/* Grab handle: the picker is a bottom sheet on phones and a centred popup from tablet up. */}
        <div className="mx-auto h-1.5 w-16 rounded-full bg-slate-300 md:hidden" aria-hidden="true" />
        {/* From tablet up the popup is two months and a bottom bar; the title stays for screen readers. */}
        <SheetHeader className="flex-row items-center justify-between px-0 pb-3 pt-5 text-left md:sr-only">
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
        <div className="grid gap-10 py-2 sm:px-4 md:grid-cols-2 md:px-0 md:py-0">
          <CalendarMonth
            month={visibleMonth}
            selected={date}
            onSelect={onDateChange}
            onPrevious={() => moveMonth(-1)}
            onNext={() => moveMonth(1)}
            nextMobileOnly
            min={min}
          />
          <div className="hidden md:block">
            <CalendarMonth
              month={new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1)}
              selected={date}
              onSelect={onDateChange}
              onNext={() => moveMonth(1)}
              min={min}
            />
          </div>
        </div>
        <div className="md:-mx-8 md:mt-6 md:flex md:items-center md:justify-between md:gap-6 md:border-t md:border-slate-200 md:px-8 md:pt-5">
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-2xl border border-slate-200 p-1 md:mt-0 md:w-[340px] md:rounded-xl">
          <div className="flex min-h-[60px] flex-col justify-center px-4 py-2">
            <span className="block text-[13px] font-semibold leading-5 text-slate-500">
              {t(departure ? "picker.departureDate" : "picker.returnDate")}
            </span>
            <strong className="block text-[16px] font-semibold leading-6">{formatDate(date)}</strong>
          </div>
          <label className="relative flex min-h-[60px] cursor-pointer flex-col justify-center rounded-xl bg-slate-100 py-2 pl-4 pr-9">
            <span className="block text-[13px] font-semibold leading-5 text-slate-500">
              {t(departure ? "picker.departureTime" : "picker.returnTime")}
            </span>
            <select
              value={effectiveTime}
              onChange={(event) => onTimeChange(event.target.value)}
              className="w-full cursor-pointer appearance-none bg-transparent text-[16px] font-semibold leading-6 outline-none"
            >
              {selectableTimes.map((option) => (
                <option key={option.value} value={option.value}>
                  {formatTimeLabel(option.value, locale)}
                </option>
              ))}
            </select>
            <ChevronDown size={20} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" />
          </label>
        </div>
        <button
          type="button"
          onClick={() => {
            if (effectiveTime !== time) onTimeChange(effectiveTime);
            onDone();
          }}
          className="mt-6 min-h-14 w-full rounded-full bg-brand px-7 text-lg font-bold text-white transition hover:bg-brand-hover md:mt-0 md:min-h-12 md:w-auto md:px-6"
        >
          {t("common.done")}
        </button>
        </div>
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
                  className={`mx-auto grid size-10 place-items-center rounded-full text-[16px] transition ${active ? "bg-brand font-bold text-white" : disabled ? "cursor-not-allowed text-slate-300" : "hover:bg-orange-100"}`}
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
