import { and, desc, eq, inArray, isNull, like } from "drizzle-orm";
import {
  BookOpen,
  CalendarDays,
  MapPinned,
  Truck,
  List,
  Columns3,
  Trash2,
  FileText,
} from "lucide-react";
import { getDb } from "@/db";
import { bookingAssignments, bookingCosts, bookings, bookingSources, bookingStorefronts, bookingTaxInvoices, bookingForms, drivers } from "@/db/schema";
import { EditDriverButton } from "@/components/bookings-admin/edit-driver";
import { BookingDeleteButton } from "@/components/booking-delete-button";
import { CopyTextButton } from "@/components/bookings-admin/copy-text";
import { isAirportPickup } from "@/lib/trip-rules";
import { bookingAddonLabels } from "@/lib/booking-addon-requests";
import { VEHICLES } from "@/lib/vehicles";
import { CreateMenu } from "@/components/bookings-admin/create-menu";
import { FormsTable } from "@/components/bookings-admin/form-requests";
import { requireWaydidiAdmin } from "@/lib/admin";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { rideUrl } from "@/lib/trip-access";
import Link from "next/link";
import { NotionCalendar } from "@/components/bookings-admin/notion-calendar";
import { WaydidiLogo } from "@/components/waydidi-logo";
import { AdminKeyLogin } from "@/components/admin-key-login";
import { PaymentReconciliationButton } from "@/components/payment-reconciliation-button";
import { backfillUnifiedPaymentFields } from "@/lib/payment-backfill";
import { fullName } from "@/lib/person-name";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Bookings · Waydidi operations",
  robots: { index: false, follow: false },
};

export default async function BookingAdminPage({ searchParams }: { searchParams: Promise<{ view?: string; type?: string; mode?: string; form?: string }> }) {
  const access = await requireWaydidiAdmin("/admin/bookings");
  if (!access.authorized) {
    return <AdminKeyLogin configured={access.configured} />;
  }
  const q = await searchParams;
  const requestHeaders = await headers();
  const view = q.form || q.view === "forms" ? "forms" : q.view === "bin" ? "bin" : "active";
  const type = q.type === "hourly" ? "hourly" : q.type === "tour" ? "tour" : "transfer";
  const mode = q.mode === "calendar" ? "calendar" : q.mode === "board" ? "board" : "list";
  await backfillUnifiedPaymentFields();

  const allRows = await getDb()
    .select()
    .from(bookings)
    .orderBy(desc(bookings.createdAt))
    .limit(100);
  // Tax invoice requests (the table may not exist yet before its migration runs).
  const taxRows = await getDb().select().from(bookingTaxInvoices).limit(500).catch(() => []);
  const taxByBooking = new Map(taxRows.map((tax) => [tax.bookingReference, tax]));
  const formsReceived = (await getDb().select({ token: bookingForms.token }).from(bookingForms).where(eq(bookingForms.status, "submitted")).catch(() => [])).length;
  // The bin is read on its own so older binned bookings still show.
  const binRows = await getDb().select().from(bookings).where(eq(bookings.status, "binned")).orderBy(desc(bookings.binnedAt)).limit(200);
  const activeRows = allRows.filter((row) => row.status !== "binned");
  const [driverRows, assignmentRows] = await Promise.all([
    getDb().select({ id: drivers.id, name: drivers.fullName, phone: drivers.phone, email: drivers.email, area: drivers.baseLocation, vehicle: drivers.vehicle, plate: drivers.carPlate, vehicleType: drivers.vehicleType, photoKey: drivers.photoKey, status: drivers.status }).from(drivers),
    getDb().select({ ref: bookingAssignments.bookingReference, driverId: bookingAssignments.driverId }).from(bookingAssignments).where(isNull(bookingAssignments.revokedAt)),
  ]);
  const driverOptions = driverRows.filter((d) => d.status === "active").map((d) => ({ id: d.id, name: d.name, phone: d.phone, email: d.email, area: d.area ?? "", vehicle: d.vehicle, plate: d.plate, vehicleType: d.vehicleType, hasPhoto: Boolean(d.photoKey) }));
  const assigned = new Map(assignmentRows.map((a) => [a.ref, a.driverId]));
  const rows = (view === "bin" ? binRows : activeRows).filter((row) => (row.serviceType ?? "transfer") === type);
  // Bookings where the storefront collects cash at the counter.
  const refs = rows.map((r) => r.reference).slice(0, 100);
  const storeLinks = refs.length ? await getDb().select({ ref: bookingStorefronts.bookingReference, cash: bookingStorefronts.cashAtStore }).from(bookingStorefronts).where(inArray(bookingStorefronts.bookingReference, refs)).catch(() => []) : [];
  const cashAtStore = new Set(storeLinks.filter((l) => l.cash).map((l) => l.ref));
  // Bookings sent by an affiliate partner (link or code): shown as "via name".
  const partnerSources = refs.length ? await getDb().select({ ref: bookingSources.bookingReference, source: bookingSources.source }).from(bookingSources).where(and(inArray(bookingSources.bookingReference, refs), like(bookingSources.source, "aff:%"))).catch(() => []) : [];
  const viaPartner = new Map(partnerSources.map((p) => [p.ref, p.source.slice(4)]));
  // Customer trip status page links for bookings that have a driver.
  const origin = (() => { const h = requestHeaders.get("host"); return h ? `${h.startsWith("localhost") ? "http" : "https"}://${h}` : ""; })();
  const tripLinks = new Map(await Promise.all(rows.filter((r) => assigned.has(r.reference)).map(async (r) => [r.reference, await rideUrl(origin, r)] as const)));
  // Driver job message (Thai labels) copied from the Assignment column.
  const costRows = refs.length ? await getDb().select({ ref: bookingCosts.bookingReference, total: bookingCosts.totalDriverCost, agreed: bookingCosts.agreedDriverCost }).from(bookingCosts).where(inArray(bookingCosts.bookingReference, refs)).catch(() => []) : [];
  const driverCost = new Map(costRows.map((c) => [c.ref, c.total || c.agreed]));
  const jobText = (row: (typeof rows)[number]) => {
    const [y, m, d] = row.pickupDate.split("-");
    const cost = driverCost.get(row.reference);
    const flight = row.flightNumber?.trim() && isAirportPickup(row) ? row.flightNumber.trim() : "";
    return [
      `${(VEHICLES as Record<string, { name: string }>)[row.vehicle]?.name ?? row.vehicle.replaceAll("_", " ")}🚗`,
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
  };
  const confirmed = activeRows.filter((row) => row.status === "confirmed").length;
  const pending = activeRows.filter((row) => row.status === "pending_payment").length;
  const emailIssues = activeRows.filter(
    (row) => row.status === "confirmed" && row.emailStatus !== "sent",
  ).length;
  const pendingRefunds = activeRows.filter((row) => row.refundStatus === "awaiting_approval").length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-plum sm:px-8">
      <div className="mx-auto max-w-[1500px]">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <Link
              href="/"
              className="mb-6 inline-flex text-brand"
              aria-label="Waydidi home"
            >
              <WaydidiLogo className="h-[88px] w-auto" />
            </Link>
            <p className="text-sm font-black uppercase tracking-[.16em] text-brand-text">
              Waydidi operations
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-[-.04em]">
              Bookings
            </h1>
            <p className="mt-2 text-slate-500">
              {view === "bin" ? "Bookings are permanently deleted 30 days after they enter the bin." : `Latest 100 bookings · signed in as ${access.user.email}`}
            </p>
          </div>
          <div className="flex gap-2 text-sm font-bold">
            <PaymentReconciliationButton auto={pending > 0} />
            <span className="rounded-full bg-emerald-100 px-4 py-2 text-emerald-800">
              {confirmed} confirmed
            </span>
            <span className="rounded-full bg-amber-100 px-4 py-2 text-amber-900">
              {pending} pending
            </span>
            {pendingRefunds > 0 && (
              <span className="rounded-full bg-orange-100 px-4 py-2 text-[#B85D00]">
                {pendingRefunds} refund approval{pendingRefunds === 1 ? "" : "s"}
              </span>
            )}
            {emailIssues > 0 && (
              <span className="rounded-full bg-red-100 px-4 py-2 text-red-800">
                {emailIssues} email issues
              </span>
            )}
          </div>
        </header>
        <nav className="mt-7 flex w-fit gap-1 rounded-2xl border border-slate-200 bg-white p-1 text-sm font-bold shadow-sm">
          <Link
            href="/admin/calendar"
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"
          >
            <CalendarDays size={17} />
            Calendar
          </Link>
          <Link
            href="/admin/bookings"
            className="flex items-center gap-2 rounded-xl bg-orange-50 px-4 py-3 text-brand-text"
          >
            <BookOpen size={17} />
            Bookings
          </Link>
          <Link
            href="/admin/operations"
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"
          >
            <Truck size={17} />
            Booking operations
          </Link>
          <Link
            href="/admin/pricing"
            className="flex items-center gap-2 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50"
          >
            <MapPinned size={17} />
            Pricing areas
          </Link>
        </nav>
        {/* "Create" sits on the page title row. */}
        <div className="-mt-[40px] mb-1 flex justify-end"><CreateMenu service={type} waiting={formsReceived} /></div>
        {/* Transfer / By the hour, each with a list or calendar view. */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Service" className="inline-flex rounded-xl bg-[#E8EAEE] p-1">
            {([["transfer", "Transfer"], ["hourly", "By the hour"], ["tour", "Tour"]] as const).map(([id, label]) => <Link key={id} role="tab" aria-selected={type === id} href={`/admin/bookings?type=${id}&mode=${mode}`} className={`h-9 rounded-lg px-4 text-[15px] leading-9 ${type === id ? "bg-white font-medium text-night shadow-sm" : "text-slate-600 hover:text-night"}`}>{label}</Link>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="View" className="inline-flex rounded-xl bg-[#E8EAEE] p-1">
            {([["list", "List", List], ["calendar", "Calendar", CalendarDays], ["board", "Board", Columns3]] as const).map(([id, label, Icon]) => <Link key={id} role="tab" aria-selected={mode === id} href={`/admin/bookings?type=${type}&mode=${id}`} className={`flex h-9 items-center gap-1.5 rounded-lg px-4 text-[15px] ${mode === id ? "bg-white font-medium text-night shadow-sm" : "text-slate-600 hover:text-night"}`}><Icon size={16} />{label}</Link>)}
          </div>
          <Link href={view === "forms" ? `/admin/bookings?type=${type}` : `/admin/bookings?type=${type}&view=forms`} aria-current={view === "forms" ? "page" : undefined} className={`flex h-11 items-center gap-1.5 rounded-xl px-4 text-[15px] font-semibold ${view === "forms" ? "bg-plum text-white" : "bg-[#E8EAEE] text-slate-700 hover:text-slate-950"}`}><FileText size={16} aria-hidden="true" />Forms{formsReceived > 0 && <span className="rounded-full bg-[#D32F2F] px-2 text-[12px] text-white">{formsReceived}</span>}</Link>
          <Link href={view === "bin" ? `/admin/bookings?type=${type}` : `/admin/bookings?type=${type}&view=bin`} aria-current={view === "bin" ? "page" : undefined} className={`flex h-11 items-center gap-1.5 rounded-xl px-4 text-[15px] font-semibold ${view === "bin" ? "bg-plum text-white" : "bg-[#E8EAEE] text-slate-700 hover:text-slate-950"}`}><Trash2 size={16} aria-hidden="true" />Bin & restore{binRows.length > 0 && <span className={`rounded-full px-2 text-[12px] ${view === "bin" ? "bg-white/20" : "bg-white"}`}>{binRows.length}</span>}</Link>
          </div>
        </div>
        {view === "forms" ? <FormsTable service={type} openForm={q.form} /> : mode !== "list" && view !== "bin" ? <NotionCalendar serviceType={type} view={mode === "board" ? "board" : "calendar"} /> :
        <section className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>{["Reference ID", "Customer name", "Date & time", "From", "To", "Vehicle", "Payment", "Driver", "Assignment", ""].map((h) => <th key={h} className="h-14 whitespace-nowrap px-4 text-[14px] font-normal">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const paid = row.paymentStatus === "paid";
                  const cash = !paid && row.paymentMethod === "cash";
                  const tax = taxByBooking.get(row.reference);
                  return <tr key={row.reference} className="align-middle hover:bg-orange-50/40">
                    <td className="px-4 py-4"><Link href={`/admin/journeys/${encodeURIComponent(row.reference)}`} className="font-semibold text-slate-900 hover:text-brand-darker">{row.reference}</Link>{viaPartner.has(row.reference) && <span className="ml-1.5 rounded-full bg-violet-50 px-2 py-0.5 text-[11.5px] font-semibold text-violet-700">via {viaPartner.get(row.reference)}</span>}{row.status !== "confirmed" && <p className="mt-0.5 text-[12px] capitalize text-slate-500">{row.status.replaceAll("_", " ")}</p>}</td>
                    <td className="px-4 py-4"><p className="font-medium text-slate-900">{row.customerName}</p><p className="text-[12px] text-slate-500">{row.customerPhone}</p>{tax && <p className="mt-1 text-[12px] font-medium text-amber-700">Tax invoice requested</p>}</td>
                    <td className="whitespace-nowrap px-4 py-4"><p className="text-slate-900">{new Date(`${row.pickupDate}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</p><p className="text-[12px] text-slate-500">{row.pickupTime}{row.returnDate && row.returnTime ? ` · return ${row.returnDate} ${row.returnTime}` : ""}</p></td>
                    <td className="max-w-[180px] px-4 py-4"><p className="line-clamp-2 text-slate-900">{row.pickup}</p></td>
                    <td className="max-w-[180px] px-4 py-4"><p className="line-clamp-2 text-slate-900">{row.serviceType === "hourly" ? `${row.bookedHours ?? ""} hours${row.pricingArea ? ` · ${row.pricingArea}` : ""}` : row.dropoff}</p></td>
                    <td className="px-4 py-4"><p className="text-slate-900">{row.vehicle.replaceAll("_", " ")}</p><p className="text-[12px] text-slate-500">{row.passengers} people · {row.luggage} bags</p>{bookingAddonLabels(row).length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{bookingAddonLabels(row).map((l) => <span key={l} className="whitespace-nowrap rounded-full bg-brand-tint px-2 py-0.5 text-[11px] font-semibold text-[#B85D00]">+ {l}</span>)}</div>}</td>
                    <td className="whitespace-nowrap px-4 py-4">
                      {paid ? <span className="inline-flex rounded-full bg-line-green px-2.5 py-0.5 text-[13px] font-medium text-white">Paid</span>
                        : cash && cashAtStore.has(row.reference) ? <span className="inline-flex rounded-full bg-[#F59E0B] px-2.5 py-0.5 text-[13px] font-medium text-white">Cash at store</span>
                        : cash ? <span className="inline-flex rounded-full bg-[#E53935] px-2.5 py-0.5 text-[13px] font-medium text-white">Pay in cash</span>
                        : <span className="inline-flex rounded-full bg-slate-200 px-2.5 py-0.5 text-[13px] font-medium text-slate-700">{row.paymentStatus.replaceAll("_", " ")}</span>}
                      <p className="mt-1 text-[12px] text-slate-500">฿{row.total.toLocaleString()}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4">{(() => { const d = driverOptions.find((o) => o.id === assigned.get(row.reference)); return d ? <span className="flex items-center gap-2"><span className="text-slate-900">{d.name}</span>{tripLinks.get(row.reference) && <CopyTextButton icon="link" text={tripLinks.get(row.reference)!} label={`Copy trip status link for ${row.reference}`} />}</span> : <span className="text-slate-400">Not assigned</span>; })()}</td>
                    <td className="px-4 py-4"><CopyTextButton text={jobText(row)} label={`Copy driver job for ${row.reference}`} /></td>
                    <td className="px-4 py-4">{view === "bin" ? <BookingDeleteButton reference={row.reference} binned purgeAfter={row.purgeAfter} /> : <div className="flex items-center gap-1"><EditDriverButton reference={row.reference} drivers={driverOptions} current={assigned.get(row.reference) ?? null} canAssign={row.status === "confirmed"} trip={row.status === "cancelled" ? undefined : { pickupDate: row.pickupDate, pickupTime: row.pickupTime, returnDate: row.returnDate ?? null, returnTime: row.returnTime ?? null, vehicle: row.vehicle, passengers: row.passengers, luggage: row.luggage }} /><BookingDeleteButton reference={row.reference} /></div>}</td>
                  </tr>;
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-5 py-16 text-center text-slate-500">
                      {view === "bin" ? "The bin is empty." : type === "tour" ? "No tour bookings yet." : type === "hourly" ? "No hourly bookings yet." : "No bookings yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>}
      </div>
    </main>
  );
}
