"use client";

import { useSyncExternalStore } from "react";
import { NO_FILTER, parseFilter, type BookingFilter } from "@/lib/booking-filter";

// The Bookings filter is shared by the Filter button (next to the View picker) and the booking cards.
// It is remembered for the browser tab only, so a reload keeps it and a new visit starts clean.
const KEY = "waydidi-bookings-filter";
let current: BookingFilter = NO_FILTER;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { current = parseFilter(JSON.parse(window.sessionStorage.getItem(KEY) ?? "null")); } catch { /* private window: no memory */ }
}
export function setBookingFilter(next: BookingFilter) {
  current = next;
  try { window.sessionStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** The server and the first browser render both see "no filter"; the saved one applies right after. */
export const useBookingFilter = () => useSyncExternalStore(subscribe, () => { load(); return current; }, () => NO_FILTER);
