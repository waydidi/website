import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Backpack, CalendarDays, Car, Check, CheckCircle2, ChevronDown, ChevronRight, Clock, Download, MapPin, Shirt, Sparkles, Ticket, Users, X } from "lucide-react";
import { getDb } from "@/db";
import { agencyApplications, smartTrips } from "@/db/schema";
import { ItineraryActions } from "@/components/itinerary/itinerary-actions";
import { ItineraryMap } from "@/components/itinerary/itinerary-map";
import { SectionTabs } from "@/components/itinerary/section-tabs";
import { TripGallery } from "@/components/itinerary/trip-gallery";
import { Breadcrumbs } from "@/components/seo";
import { ticketStops, tripHighlights, tripPhotos } from "@/lib/trip-photos";
import { YourDay } from "@/components/itinerary/your-day";
import { TripFeedback } from "@/components/itinerary/trip-feedback";
import { reviewUrl } from "@/lib/trip-thanks";
import { groupDays, tripByToken, tripSnapshot, type TripSnapshot } from "@/lib/smart-trips";
import { getWaydidiAdmin } from "@/lib/admin";
import { dateLocale, fill, tripWords, type TripWords } from "@/lib/trip-i18n";
import { FULL_REFUND_HOURS } from "@/lib/refund-policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your itinerary · Waydidi", robots: { index: false, follow: false }, referrer: "no-referrer" };

const hhmm = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const longDate = (d: string | null, lang: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString(dateLocale(lang), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—");
const dur = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
const thb = (n: number) => `THB ${n.toLocaleString("en-US")}`;

/** Past trip date, or the price hold is over. */
function quoteExpired(tripDate: string | null, sentAt: string | null, holdDays: number) {
  const now = Date.now();
  const today = new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
  return Boolean((tripDate && tripDate < today) || (sentAt && now - Date.parse(sentAt) > holdDays * 86_400_000));
}

/** True from the trip day onwards (Bangkok time). */
function tripStarted(tripDate: string | null) {
  return Boolean(tripDate && tripDate <= new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
}

function Unavailable({ title, text, home }: { title: string; text: string; home: string }) {
  return <main className="grid min-h-[70vh] place-items-center bg-canvas px-5"><div className="max-w-md rounded-[24px] bg-white p-8 text-center"><h1 className="text-[24px] font-bold">{title}</h1><p className="mt-3 text-slate-600">{text}</p><Link href="/" className="mt-5 inline-flex h-11 items-center rounded-full bg-brand px-5 font-semibold text-white">{home}</Link></div></main>;
}

export default async function ItineraryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const opened = await tripByToken(token);
  const days = opened ? (await groupDays(opened)).map((d) => ({ trip: d, snap: tripSnapshot(d) })).filter((d): d is { trip: typeof d.trip; snap: TripSnapshot } => Boolean(d.snap)) : [];
  const lead = days[0];
  const w = tripWords(opened?.language);
  if (!opened || !lead) return <Unavailable title={w.notFound} text={w.notFoundText} home={w.home} />;
  const trip = lead.trip, s = lead.snap;
  if (trip.status === "cancelled") return <Unavailable title={w.withdrawn} text={w.withdrawnText} home={w.home} />;
  // Staff previews don't count as the customer opening it.
  if (!trip.viewedAt && !(await getWaydidiAdmin())) await getDb().update(smartTrips).set({ viewedAt: new Date().toISOString() }).where(eq(smartTrips.id, trip.id)).catch(() => undefined);
  const [agency] = trip.agencyId ? await getDb().select({ name: agencyApplications.agencyName }).from(agencyApplications).where(eq(agencyApplications.id, trip.agencyId)).limit(1) : [];
  const lang = trip.language;
  const paid = trip.status === "accepted";
  const expired = !paid && quoteExpired(s.tripDate, trip.sentAt, trip.holdDays);
  const multi = days.length > 1;
  const sum = (f: (x: TripSnapshot) => number) => days.reduce((n, d) => n + f(d.snap), 0);
  const total = sum((x) => x.total);
  const packing = [...new Set(days.flatMap((d) => d.snap.packing))];
  const travellers = s.adults + s.children;
  const leadToken = trip.token;

  const allStops = days.flatMap((d) => d.snap.stops.filter((x) => !(d.snap.liveSkipped ?? []).includes(x.id)));
  const photos = tripPhotos(allStops);
  const highlights = tripHighlights(allStops);
  const tickets = ticketStops(allStops);
  const tabs = [
    { id: "overview", label: w.tabOverview }, { id: "itinerary", label: w.tabItinerary },
    ...(highlights.length ? [{ id: "highlights", label: w.tabHighlights }] : []), { id: "includes", label: w.tabIncludes },
    ...(packing.length ? [{ id: "bring", label: w.tabBring }] : []), ...(days.some((d) => d.snap.notes) ? [{ id: "notes", label: w.tabNotes }] : []),
    { id: "booking", label: w.tabBooking },
  ];
  const card = "scroll-mt-[140px] lg:scroll-mt-[168px] rounded-card bg-white p-5 shadow-sm sm:p-7";

  return <main className="bg-canvas pb-16 text-plum">
    <div className="bg-white">
      <div className="mx-auto max-w-[880px] px-4 pb-5 pt-5">
        <Breadcrumbs crumbs={[{ name: w.crumbHome, path: "/" }, { name: s.title, path: `/itinerary/${leadToken}` }]} separator={<ChevronRight size={16} className="inline" />} className="text-[15px] text-slate-600" />
        <h1 className="mt-3 text-[30px] font-black leading-tight tracking-[-.035em] sm:text-[40px]">{s.title}</h1>
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[16px]">
          <span className="font-semibold text-brand-deep">{agency ? fill(w.preparedBy, { agency: agency.name }) : multi ? fill(w.multiDay, { n: days.length }) : w.privateTrip}</span>
          <span aria-hidden className="size-1 rounded-full bg-slate-300" />
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={16} className="text-slate-500" />{longDate(s.tripDate, lang)}{multi ? ` – ${longDate(days.at(-1)!.snap.tripDate, lang)}` : ""}</span>
          <span aria-hidden className="size-1 rounded-full bg-slate-300" />
          <span className="inline-flex items-center gap-1.5"><MapPin size={16} className="text-slate-500" />{allStops.length === 1 ? w.stopCount : fill(w.stopsCount, { n: allStops.length })}</span>
        </p>
      </div>
      <div className="mx-auto max-w-[880px] sm:px-4 sm:pb-5"><TripGallery photos={photos} words={w} /></div>
    </div>
    <SectionTabs tabs={tabs} label={w.sectionsNav} />

    <div className="mx-auto mt-5 grid max-w-[880px] gap-4 px-4">
      {paid && <div className="rounded-card bg-emerald-50 p-5 text-emerald-900 shadow-sm"><p className="flex items-center gap-2 text-[17px] font-bold"><CheckCircle2 size={20} />{w.paidTitle}{trip.bookingReference ? ` · ${trip.bookingReference}` : ""}</p>
        <p className="mt-1 text-[15px]">{w.paidText}</p>
        {trip.bookingReference && <Link href={`/trip/${trip.bookingReference}?day=${leadToken}`} className="mt-3 inline-flex h-11 items-center rounded-full bg-emerald-700 px-5 font-semibold text-white">{w.openYourDay}</Link>}</div>}
      {paid && <YourDay token={leadToken} words={w} />}
      {paid && tripStarted(s.tripDate) && <TripFeedback token={leadToken} rating={trip.feedbackRating} reviewUrl={reviewUrl()} words={w} />}
      {trip.status === "changes_requested" && <div className="rounded-card bg-amber-50 p-5 text-amber-900 shadow-sm"><p className="font-bold">{w.updating}</p><p className="mt-1 text-[15px]">{w.updatingText}</p></div>}

      <section id="overview" className={card}>
        <h2 className="text-[22px] font-bold">{w.overview}</h2>
        {s.customerName && <p className="mt-2 text-[15px] text-slate-600">{fill(w.for, { name: s.customerName })}</p>}
        <ul className="mt-4 grid gap-3 text-[15px] sm:grid-cols-2">
          <li className="flex items-start gap-2.5"><Clock size={18} className="mt-0.5 shrink-0 text-brand-text" /><span>{fill(w.pickup, { time: s.startTime })}<span className="block text-slate-600">{s.pickupText}</span></span></li>
          {!multi && <li className="flex items-start gap-2.5"><CalendarDays size={18} className="mt-0.5 shrink-0 text-brand-text" />{fill(w.backAround, { time: hhmm(s.returnAt) })}</li>}
          <li className="flex items-start gap-2.5"><Users size={18} className="mt-0.5 shrink-0 text-brand-text" />{travellers > 1 ? fill(w.travellers, { n: travellers }) : w.traveller}</li>
          <li className="flex items-start gap-2.5"><Car size={18} className="mt-0.5 shrink-0 text-brand-text" />{fill(w.vehicleLine, { car: s.vehicleName })}</li>
        </ul>
      </section>

      <section id="itinerary" className="grid scroll-mt-[140px] lg:scroll-mt-[168px] gap-4">
        {multi && <nav aria-label="Days" className="flex gap-2 overflow-x-auto rounded-card bg-white p-3 shadow-sm">{days.map((d) => <a key={d.trip.id} href={`#day-${d.trip.dayNumber}`} className="shrink-0 rounded-full border border-slate-200 px-4 py-2 text-[14px] font-semibold hover:border-brand">{fill(w.day, { n: d.trip.dayNumber })} · {d.snap.tripDate ? new Date(`${d.snap.tripDate}T12:00:00Z`).toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", timeZone: "UTC" }) : ""}</a>)}</nav>}
        {days.map((d) => <DaySection key={d.trip.id} s={d.snap} w={w} title={multi ? `${fill(w.day, { n: d.trip.dayNumber })} · ${longDate(d.snap.tripDate, lang)}` : w.yourDay} id={multi ? `day-${d.trip.dayNumber}` : undefined} />)}
      </section>

      {highlights.length > 0 && <section id="highlights" className={card}>
        <h2 className="text-[22px] font-bold">{w.highlights}</h2>
        <div className="mt-4 grid gap-5">{highlights.map((h) => <div key={h.stop}><h3 className="text-[16px] font-bold">{h.stop}</h3>
          <ul className="mt-2 grid gap-1.5 text-[15px] text-slate-700">{h.items.map((x) => <li key={x} className="flex gap-2"><Sparkles size={16} className="mt-1 shrink-0 text-brand-text" />{x}</li>)}</ul></div>)}</div>
      </section>}

      <section id="includes" className={card}>
        <div className="grid gap-6 sm:grid-cols-2">
          <div><h2 className="text-[20px] font-bold">{w.included}</h2>
            <ul className="mt-3 grid gap-2 text-[15px]">
              {[w.transport, w.hotelTransfer, ...(tickets.included.length ? [fill(w.ticketsAt, { places: tickets.included.join(", ") })] : [])].map((x) => <li key={x} className="flex gap-2"><Check size={18} className="mt-0.5 shrink-0 text-emerald-600" />{x}</li>)}
            </ul></div>
          {tickets.onSite.length > 0 && <div><h2 className="text-[20px] font-bold">{w.notIncluded}</h2>
            <ul className="mt-3 grid gap-2 text-[15px]">{tickets.onSite.map((place) => <li key={place} className="flex gap-2"><X size={18} className="mt-0.5 shrink-0 text-slate-400" />{fill(w.feeAt, { place })}</li>)}</ul></div>}
        </div>
      </section>

      {packing.length > 0 && <section id="bring" className={card}><h2 className="flex items-center gap-2 text-[20px] font-bold"><Backpack size={20} className="text-brand-text" />{w.whatToBring}</h2>
        <ul className="mt-3 grid gap-2 text-[15px] sm:grid-cols-2">{packing.map((p) => <li key={p} className="flex gap-2"><CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-600" />{p}</li>)}</ul></section>}

      {days.some((d) => d.snap.notes) && <section id="notes" className={card}><h2 className="text-[20px] font-bold">{w.notes}</h2>
        {days.filter((d) => d.snap.notes).map((d) => <p key={d.trip.id} className="mt-2 whitespace-pre-line text-[15px] text-slate-700">{multi ? `${fill(w.day, { n: d.trip.dayNumber })}: ` : ""}{d.snap.notes}</p>)}</section>}

      <section id="booking" className="scroll-mt-[140px] rounded-card border border-slate-200 bg-white p-5 shadow-sm sm:p-7 lg:scroll-mt-[168px]">
        <p className="text-[15px] text-slate-600">{w.totalFor}</p>
        <p className="mt-1 text-[32px] font-black tracking-[-.03em]">{thb(total)}</p>
        <dl className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-[15px]">
          {multi ? days.map((d) => <div key={d.trip.id} className="flex justify-between"><dt className="text-slate-600">{fill(w.day, { n: d.trip.dayNumber })}</dt><dd>{thb(d.snap.total)}</dd></div>) : <>
            <div className="flex justify-between gap-3"><dt className="text-slate-600">{w.transport}</dt><dd>{thb(s.transportPrice)}</dd></div>
            {s.feesIncluded > 0 && <div className="flex justify-between gap-3"><dt className="text-slate-600">{w.tickets}</dt><dd>{thb(s.feesIncluded)}</dd></div>}
            {s.discount > 0 && <div className="flex justify-between gap-3 text-emerald-700"><dt>{w.discount}</dt><dd>−{thb(s.discount)}</dd></div>}
          </>}
          {sum((x) => x.feesOnSite) > 0 && <p className="text-[13px] text-slate-500">{fill(w.plusFees, { amount: thb(sum((x) => x.feesOnSite)) })}</p>}
        </dl>
        <div className="mt-5">
          {paid ? null : expired ? <p className="rounded-xl bg-slate-50 p-4 text-[15px] text-slate-700">{w.expired}</p>
            : <ItineraryActions token={leadToken} total={total} name={trip.customerName ?? ""} email={trip.customerEmail ?? ""} phone={trip.customerPhone ?? ""} words={w} />}
        </div>
        <a href={`/api/itinerary/${leadToken}/pdf`} className="mt-4 inline-flex min-h-tap items-center gap-1.5 text-[15px] font-semibold text-brand-darker hover:underline"><Download size={16} />{w.downloadPdf}</a>
        <p className="mt-1 text-[12px] text-slate-500">{fill(w.refLine, { ref: s.ref, v: s.version, hours: FULL_REFUND_HOURS })} <Link href="/refund-policy" className="underline">{w.policy}</Link>.</p>
      </section>
    </div>
  </main>;
}

function DaySection({ s, w, title, id }: { s: TripSnapshot; w: TripWords; title: string; id?: string }) {
  const skipped = s.liveSkipped ?? [];
  const stops = s.stops.filter((x) => !skipped.includes(x.id));
  const points = [
    ...(s.pickup ? [{ id: "pickup", lat: s.pickup.lat, lng: s.pickup.lng, label: "P", title: s.pickupText, kind: "pickup" as const }] : []),
    ...stops.filter((x) => x.lat != null && x.lng != null).map((x, i) => ({ id: x.id, lat: x.lat!, lng: x.lng!, label: String(i + 1), title: x.name, kind: "stop" as const })),
    ...(s.end ? [{ id: "end", lat: s.end.lat, lng: s.end.lng, label: "E", title: s.endText, kind: "end" as const }] : s.pickup && stops.length ? [{ id: "back", lat: s.pickup.lat, lng: s.pickup.lng, label: "P", title: w.backAtHotel, kind: "end" as const }] : []),
  ];
  return <>
    <section id={id} className="scroll-mt-[140px] lg:scroll-mt-[168px] overflow-hidden rounded-card bg-white shadow-sm"><ItineraryMap points={points} /></section>
    <section className="rounded-card bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-[22px] font-bold">{title}</h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full table-fixed border-collapse text-left">
          <thead className="bg-brand-wash text-[13px] font-bold uppercase tracking-wider text-slate-600">
            <tr><th scope="col" className="w-[92px] border-r border-slate-200 px-3 py-2.5 sm:w-[120px]">{w.timeCol}</th><th scope="col" className="px-3 py-2.5">{w.placesCol}</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-200 align-top">
            <Row time={s.startTime} title={w.hotelPickup} sub={s.pickupText} dot="P" />
            {stops.map((st, i) => <tr key={st.id}>
              <td className="border-r border-slate-200 px-3 py-3 text-[15px] font-bold tabular-nums">{hhmm(st.start)}<span className="block font-semibold text-slate-500">– {hhmm(st.end)}</span></td>
              <td className="min-w-0 px-3 py-3">
                {st.travelMin > 0 && <p className="mb-1 text-[13px] text-slate-500">{fill(w.drive, { d: dur(st.travelMin) })}</p>}
                <h3 className="text-[17px] font-bold"><span className="mr-2 inline-grid size-6 place-items-center rounded-full bg-brand text-[12px] text-ink">{i + 1}</span>{st.name}</h3>
                {st.program && <p className="mt-0.5 text-[14px] text-slate-600">{st.program}</p>}
                {st.checkIn != null && <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-2.5 py-1 text-[13px] font-semibold text-[#9A4D00]"><Ticket size={14} />{fill(w.sessionCheckIn, { time: st.sessionTime ?? "", checkIn: hhmm(st.checkIn) })}</p>}
                {st.cover && <img src={st.cover} alt={st.name} className="mt-3 aspect-[16/9] w-full rounded-xl object-cover" loading="lazy" />}
                {st.highlights.length > 0 && <ul className="mt-2 grid gap-1 text-[14px] text-slate-700">{st.highlights.map((h) => <li key={h}>• {h}</li>)}</ul>}
                {st.description && <details className="group mt-2">
                  <summary className="flex min-h-tap cursor-pointer list-none items-center gap-2 text-[14px] font-semibold text-brand-deep [&::-webkit-details-marker]:hidden">
                    {w.seeDetails}<ChevronDown aria-hidden="true" size={16} className="transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-1 text-[15px] leading-7 text-slate-700">{st.description}</p>
                </details>}
                {st.gallery.length > 0 && <div className="mt-3 flex gap-2 overflow-x-auto">{st.gallery.slice(0, 6).map((g) => <img key={g} src={g} alt="" className="h-20 w-28 shrink-0 rounded-lg object-cover" loading="lazy" />)}</div>}
                {st.dressCode && <p className="mt-2 flex items-center gap-1.5 text-[14px] font-semibold"><Shirt size={15} className="text-brand-text" />{st.dressCode}</p>}
                {st.fee && <p className="mt-1 text-[13px] text-slate-500">{st.fee.included ? w.ticketsIncluded : `${fill(w.feeOnDay, { adult: thb(st.fee.adult) })}${st.fee.child ? fill(w.feeChild, { child: thb(st.fee.child) }) : ""}.`}</p>}
                {st.note && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-[14px] text-slate-700">{st.note}</p>}
              </td>
            </tr>)}
            <Row time={hhmm(s.returnAt)} title={s.end ? w.dropOff : w.backAtHotel} sub={s.endText} dot="P" />
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[13px] text-slate-500">{w.timesNote}</p>
    </section>
  </>;
}

function Row({ time, title, sub, dot }: { time: string; title: string; sub: string; dot: string }) {
  return <tr><td className="border-r border-slate-200 px-3 py-3 text-[15px] font-bold tabular-nums">{time}</td>
    <td className="px-3 py-3"><p className="flex items-center gap-2 text-[16px] font-bold"><span className="grid size-6 place-items-center rounded-full bg-plum text-[12px] text-white">{dot}</span>{title}</p><p className="mt-0.5 flex items-start gap-1 text-[14px] text-slate-600"><MapPin size={14} className="mt-0.5 shrink-0" />{sub}</p></td></tr>;
}
