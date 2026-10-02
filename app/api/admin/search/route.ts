import { desc, like, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { bookings, customers, drivers, promoCodes, storefronts } from "@/db/schema";
import { getWaydidiAdmin } from "@/lib/admin";

export type AdminSearchHit = { group: string; label: string; detail: string; href: string };

// Admin search box: bookings, customers, drivers, promo codes and storefronts.
export async function GET(request: Request) {
  if (!(await getWaydidiAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return NextResponse.json({ hits: [] });
  const term = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const db = getDb();
  const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [b, c, d, p, s] = await Promise.all([
    safe(db.select({ reference: bookings.reference, name: bookings.customerName, surname: bookings.customerSurname, date: bookings.pickupDate, pickup: bookings.pickup, dropoff: bookings.dropoff, status: bookings.status }).from(bookings)
      .where(or(like(bookings.reference, term), like(bookings.customerName, term), like(bookings.customerSurname, term), like(bookings.customerEmail, term), like(bookings.customerPhone, term), like(bookings.pickup, term), like(bookings.dropoff, term), like(bookings.flightNumber, term)))
      .orderBy(desc(bookings.createdAt)).limit(8)),
    safe(db.select({ name: customers.name, surname: customers.surname, email: customers.email, phone: customers.phone }).from(customers)
      .where(or(like(customers.email, term), like(customers.name, term), like(customers.surname, term), like(customers.phone, term))).limit(5)),
    safe(db.select({ name: drivers.fullName, phone: drivers.phone, plate: drivers.carPlate, vehicle: drivers.vehicle }).from(drivers)
      .where(or(like(drivers.fullName, term), like(drivers.phone, term), like(drivers.carPlate, term), like(drivers.vehicle, term))).limit(5)),
    safe(db.select({ code: promoCodes.code, title: promoCodes.title }).from(promoCodes).where(or(like(promoCodes.code, term), like(promoCodes.title, term))).limit(5)),
    safe(db.select({ name: storefronts.name, slug: storefronts.slug, area: storefronts.area }).from(storefronts).where(or(like(storefronts.name, term), like(storefronts.slug, term), like(storefronts.contactName, term))).limit(5)),
  ]);
  const hits: AdminSearchHit[] = [
    ...b.map((r) => ({ group: "Bookings", label: `${r.reference} · ${[r.name, r.surname].filter(Boolean).join(" ")}`, detail: `${r.date} · ${r.pickup}${r.dropoff ? ` → ${r.dropoff}` : ""}${r.status === "binned" ? " · in bin" : ""}`, href: `/admin/journeys/${encodeURIComponent(r.reference)}` })),
    ...c.map((r) => ({ group: "Customers", label: [r.name, r.surname].filter(Boolean).join(" ") || r.email, detail: [r.email, r.phone].filter(Boolean).join(" · "), href: `/admin/users?q=${encodeURIComponent(r.email)}` })),
    ...d.map((r) => ({ group: "Drivers", label: r.name, detail: [r.phone, r.plate, r.vehicle].filter(Boolean).join(" · "), href: "/admin/drivers" })),
    ...p.map((r) => ({ group: "Promo codes", label: r.code, detail: r.title, href: "/admin/promotions" })),
    ...s.map((r) => ({ group: "Storefronts", label: r.name, detail: [r.slug, r.area].filter(Boolean).join(" · "), href: "/admin/storefronts" })),
  ];
  return NextResponse.json({ hits });
}
