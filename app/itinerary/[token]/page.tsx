import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import type { ReactNode } from "react";
import { Backpack, CalendarDays, CheckCircle2, ChevronRight, Clock, Download, Landmark, MapPin, Shirt, Ticket, X } from "lucide-react";
import { getDb } from "@/db";
import { agencyApplications, smartTrips } from "@/db/schema";
import { HighlightsCard } from "@/components/itinerary/highlights-card";
import { ItineraryActions } from "@/components/itinerary/itinerary-actions";
import { ItineraryMap } from "@/components/itinerary/itinerary-map";
import { SectionTabs } from "@/components/itinerary/section-tabs";
import { TripGallery } from "@/components/itinerary/trip-gallery";
import { ticketStops, tripHighlights, tripPhotos, withCurrentPhotos } from "@/lib/trip-photos";
import { attractionsById } from "@/lib/attractions";
import { YourDay } from "@/components/itinerary/your-day";
import { TripFeedback } from "@/components/itinerary/trip-feedback";
import { reviewUrl } from "@/lib/trip-thanks";
import { groupDays, tripByToken, tripSnapshot, tripStops, type TripSnapshot } from "@/lib/smart-trips";
import { getWaydidiAdmin } from "@/lib/admin";
import { dateLocale, fill, tripWords, type TripWords } from "@/lib/trip-i18n";
import { FULL_REFUND_HOURS } from "@/lib/refund-policy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your itinerary · Waydidi", robots: { index: false, follow: false }, referrer: "no-referrer" };

const hhmm = (min: number) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`; };
const longDate = (d: string | null, lang: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString(dateLocale(lang), { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "—");
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
  const sentDays = opened ? (await groupDays(opened)).map((d) => ({ trip: d, snap: tripSnapshot(d) })).filter((d): d is { trip: typeof d.trip; snap: TripSnapshot } => Boolean(d.snap)) : [];
  // Photos come from the attractions as they are now (staff may add them after sending); everything else as sent.
  const attractionOf = Object.fromEntries(sentDays.flatMap((d) => tripStops(d.trip).map((x) => [x.id, x.attractionId])));
  const current = await attractionsById(Object.values(attractionOf).filter((x): x is string => Boolean(x)));
  const days = sentDays.map((d) => ({ ...d, snap: { ...d.snap, stops: withCurrentPhotos(d.snap.stops, attractionOf, current) } }));
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
  const highlightItems = [...new Set(highlights.flatMap((h) => h.items))];
  const tabs = [
    ...(highlightItems.length ? [{ id: "highlights", label: w.highlights }] : []), { id: "expect", label: w.tabExpect },
    { id: "includes", label: w.tabIncludes }, { id: "booking", label: w.tabBooking },
  ];
  const lastReturn = hhmm(days.at(-1)!.snap.returnAt);
  const dressCodes = [...new Map(allStops.filter((x) => x.dressCode).map((x) => [x.dressCode!, x.name])).entries()];
  // Every section runs the full width of the page (no card); headings carry a short coloured bar, like Klook's.
  const card = "-mx-4 scroll-mt-[140px] bg-white px-4 py-6 sm:px-7 lg:scroll-mt-[168px]";
  const heading = "border-l-4 border-brand pl-3 text-[22px] font-bold leading-7";

  return <main className="bg-canvas pb-16 text-plum">
    <div className="mx-auto max-w-[880px]"><TripGallery photos={photos} words={w} /></div>
    <div className={`relative z-10 mx-auto max-w-[880px] bg-white px-4 pb-6 pt-6 sm:px-7 ${photos.length ? "-mt-5 rounded-t-card" : ""}`}>
      <h1 className="text-[28px] font-black leading-tight tracking-[-.035em] sm:text-[38px]">{s.title}</h1>
      {s.pickupText && <p className="mt-2 text-[17px] text-slate-600">{fill(w.departingFrom, { place: "" })}<span className="font-semibold text-plum">{s.pickupText}</span></p>}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[15px]">
        <span className="font-semibold text-brand-deep">{agency ? fill(w.preparedBy, { agency: agency.name }) : multi ? fill(w.multiDay, { n: days.length }) : w.privateTrip}</span>
        <span aria-hidden className="text-slate-300">•</span>
        <span className="inline-flex items-center gap-1.5 text-slate-700"><CalendarDays size={15} className="text-slate-500" />{longDate(s.tripDate, lang)}{multi ? ` – ${longDate(days.at(-1)!.snap.tripDate, lang)}` : ""}</span>
      </p>
      <ul className="mt-4 flex flex-wrap gap-2 text-[15px] text-slate-700">
        {[w.privateCarChip, w.hotelPickup, travellers > 1 ? fill(w.travellers, { n: travellers }) : w.traveller, multi ? fill(w.daysChip, { n: days.length }) : fill(w.hoursChip, { n: s.durationHours }), allStops.length === 1 ? w.stopCount : fill(w.stopsCount, { n: allStops.length })].map((c) => <li key={c} className="rounded-md bg-slate-100 px-3 py-1.5">{c}</li>)}
      </ul>
    </div>
    <SectionTabs tabs={tabs} label={w.sectionsNav} />

    <div className="mx-auto mt-5 grid max-w-[880px] gap-4 px-4">
      {paid && <div className="-mx-4 bg-emerald-50 px-4 py-5 text-emerald-900 sm:px-7"><p className="flex items-center gap-2 text-[17px] font-bold"><CheckCircle2 size={20} />{w.paidTitle}{trip.bookingReference ? ` · ${trip.bookingReference}` : ""}</p>
        <p className="mt-1 text-[15px]">{w.paidText}</p>
        {trip.bookingReference && <Link href={`/trip/${trip.bookingReference}?day=${leadToken}`} className="mt-3 inline-flex h-11 items-center rounded-full bg-emerald-700 px-5 font-semibold text-white">{w.openYourDay}</Link>}</div>}
      {paid && <YourDay token={leadToken} words={w} />}
      {paid && tripStarted(s.tripDate) && <TripFeedback token={leadToken} rating={trip.feedbackRating} reviewUrl={reviewUrl()} words={w} />}
      {trip.status === "changes_requested" && <div className="-mx-4 bg-amber-50 px-4 py-5 text-amber-900 sm:px-7"><p className="font-bold">{w.updating}</p><p className="mt-1 text-[15px]">{w.updatingText}</p></div>}

      {highlightItems.length > 0 && <section id="highlights" className={card}>
        <h2 className={heading}>{w.highlights}</h2>
        <div className="mt-4"><HighlightsCard items={highlightItems} words={w} /></div>
      </section>}

      <section id="expect" className={card}>
        <h2 className={heading}>{w.tabExpect}</h2>
        <WhatToExpect days={days.map((d) => ({ id: d.trip.id, label: multi ? fill(w.day, { n: d.trip.dayNumber }) : "", s: d.snap }))} stops={allStops} w={w} />
        <h3 className="mt-8 text-[20px] font-bold">{w.itineraryHeading}</h3>
        <div className="mt-5 grid gap-8">
          {multi && <nav aria-label="Days" className="flex gap-2 overflow-x-auto">{days.map((d) => <a key={d.trip.id} href={`#day-${d.trip.dayNumber}`} className="shrink-0 rounded-full border border-slate-200 px-4 py-2 text-[14px] font-semibold hover:border-brand">{fill(w.day, { n: d.trip.dayNumber })} · {d.snap.tripDate ? new Date(`${d.snap.tripDate}T12:00:00Z`).toLocaleDateString(dateLocale(lang), { day: "numeric", month: "short", timeZone: "UTC" }) : ""}</a>)}</nav>}
          {days.map((d) => <DayTimeline key={d.trip.id} s={d.snap} w={w} title={multi ? `${fill(w.day, { n: d.trip.dayNumber })} · ${longDate(d.snap.tripDate, lang)}` : undefined} id={multi ? `day-${d.trip.dayNumber}` : undefined} />)}
        </div>
      </section>

      <section id="includes" className={card}>
        <h2 className={heading}>{w.included}</h2>
        <ul className="mt-4 grid gap-3 text-[16px]">
          {[w.transport, w.hotelTransfer, ...(tickets.included.length ? [fill(w.ticketsAt, { places: tickets.included.join(", ") })] : [])].map((x) => <li key={x} className="flex items-start gap-3"><CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" />{x}</li>)}
          {tickets.onSite.map((place) => <li key={place} className="flex items-start gap-3"><X size={20} className="mt-0.5 shrink-0 text-slate-400" /><span><span className="sr-only">{w.notIncluded}: </span>{fill(w.feeAt, { place })}</span></li>)}
        </ul>
        <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
          <More title={w.accPickup}>
            <ul className="grid gap-1.5">{days.map((d) => <li key={d.trip.id}>{multi ? `${fill(w.day, { n: d.trip.dayNumber })} · ` : ""}{fill(w.pickupAt, { time: d.snap.startTime, place: d.snap.pickupText || w.hotelPickup })}</li>)}</ul>
            {!multi && <p className="mt-1.5">{fill(w.backAround, { time: lastReturn })}{s.endText && s.endText !== s.pickupText ? ` · ${s.endText}` : ""}</p>}
          </More>
          {(packing.length > 0 || dressCodes.length > 0 || days.some((d) => d.snap.notes)) && <More title={w.accBefore}>
            {packing.length > 0 && <><p className="font-semibold text-plum">{w.whatToBring}</p><ul className="mt-1.5 grid gap-1.5">{packing.map((p) => <li key={p} className="flex gap-2"><Backpack size={16} className="mt-1 shrink-0 text-brand-text" />{p}</li>)}</ul></>}
            {dressCodes.length > 0 && <ul className="mt-3 grid gap-1.5">{dressCodes.map(([code, place]) => <li key={code} className="flex gap-2"><Shirt size={16} className="mt-1 shrink-0 text-brand-text" />{place}: {code}</li>)}</ul>}
            {days.filter((d) => d.snap.notes).map((d) => <p key={d.trip.id} className="mt-3 whitespace-pre-line"><span className="font-semibold text-plum">{w.notes}{multi ? ` (${fill(w.day, { n: d.trip.dayNumber })})` : ""}: </span>{d.snap.notes}</p>)}
          </More>}
          <More title={w.accTerms}>
            <p>{fill(w.refLine, { ref: s.ref, v: s.version, hours: FULL_REFUND_HOURS })} <Link href="/refund-policy" className="font-semibold text-brand-deep underline">{w.policy}</Link>.</p>
            {!paid && <p className="mt-2">{fill(w.priceHeld, { n: trip.holdDays })}</p>}
            <p className="mt-2">{w.timesNote}</p>
          </More>
          <More title={w.accHow}>
            <ol className="grid list-decimal gap-1.5 pl-5">{[w.howStep1, w.howStep2, w.howStep3].map((x) => <li key={x}>{x}</li>)}</ol>
          </More>
        </div>
      </section>

      <section id="booking" className={card}>
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

/**
 * "What to expect", like Klook's: one line about the day, a bullet per place, then a board of the places numbered in
 * visiting order with their photos, and a dashed box with the meeting point, how long the day runs and entrance fees.
 */
function WhatToExpect({ days, stops, w }: { days: { id: string; label: string; s: TripSnapshot }[]; stops: TripSnapshot["stops"]; w: TripWords }) {
  const s = days[0].s;
  const fees = [...new Map(stops.filter((x) => x.fee && x.fee.adult + x.fee.child > 0).map((x) => [x.name, x.fee!])).entries()];
  const prefix = (label: string) => (label ? `${label} · ` : "");
  return <>
    <p className="mt-4 text-[17px] leading-7">{fill(w.expectIntro, { place: s.pickupText || w.hotelPickup })}</p>
    <ul className="mt-3 grid gap-2.5 text-[17px] leading-7">
      {stops.map((x) => <li key={x.id} className="flex gap-3"><span aria-hidden className="mt-[11px] size-1.5 shrink-0 rounded-full bg-plum" />{x.description?.trim() || fill(w.visitPlace, { place: x.name })}</li>)}
    </ul>
    {stops.length > 0 && <div className="mt-6 rounded-card bg-brand-wash p-4 sm:p-5">
      <ol className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3">
        {stops.map((x, i) => { const photo = x.cover ?? x.gallery[0]; return <li key={x.id} className="relative">
          <span aria-hidden className="absolute -left-1.5 -top-1.5 z-10 grid size-9 place-items-center rounded-full border-2 border-white bg-brand-deep text-[17px] font-black text-white shadow">{i + 1}</span>
          {photo ? <img src={photo} alt={x.name} loading="lazy" className="aspect-[4/3] w-full rounded-xl object-cover" /> : <span className="grid aspect-[4/3] w-full place-items-center rounded-xl bg-white text-brand-deep"><Landmark size={28} aria-hidden /></span>}
          <p className="mt-2 text-center text-[15px] font-bold leading-5">{x.name}</p>
        </li>; })}
      </ol>
      <dl className="mt-5 grid gap-3 rounded-xl border-2 border-dashed border-brand/60 bg-white p-4 text-[15px] leading-6">
        <div><dt className="flex items-center gap-1.5 font-bold"><MapPin size={16} className="text-brand-deep" aria-hidden />{w.meetingPoint}</dt>
          {days.map((d) => <dd key={d.id}>{prefix(d.label)}{fill(w.pickupAt, { time: d.s.startTime, place: d.s.pickupText || w.hotelPickup })}</dd>)}</div>
        <div><dt className="flex items-center gap-1.5 font-bold"><Clock size={16} className="text-brand-deep" aria-hidden />{w.durationLabel}</dt>
          {days.map((d) => <dd key={d.id}>{prefix(d.label)}{fill(w.durationValue, { start: d.s.startTime, end: hhmm(d.s.returnAt) })}</dd>)}</div>
        {fees.length > 0 && <div><dt className="flex items-center gap-1.5 font-bold"><Ticket size={16} className="text-brand-deep" aria-hidden />{w.entranceFees}</dt>
          {fees.map(([place, f]) => <dd key={place}>{fill(w.feePerAdult, { place, adult: f.adult.toLocaleString("en-US") })}{f.child > 0 ? fill(w.feePerChild, { child: f.child.toLocaleString("en-US") }) : ""} <span className={f.included ? "font-semibold text-emerald-700" : "text-slate-600"}>({f.included ? w.feeIncludedTag : w.feeOnDayTag})</span></dd>)}</div>}
      </dl>
    </div>}
  </>;
}

/** One collapsible row under What's included (no script needed: native details/summary). */
function More({ title, children }: { title: string; children: ReactNode }) {
  return <details className="group">
    <summary className="flex min-h-[60px] cursor-pointer list-none items-center justify-between gap-3 text-[18px] font-bold [&::-webkit-details-marker]:hidden">
      {title}<ChevronRight aria-hidden size={22} className="shrink-0 transition-transform group-open:rotate-90" />
    </summary>
    <div className="pb-5 text-[15px] leading-7 text-slate-700">{children}</div>
  </details>;
}

/** One day as a timeline: map, then departure, each place (name, time, photo) and the return, on one grey line. */
function DayTimeline({ s, w, title, id }: { s: TripSnapshot; w: TripWords; title?: string; id?: string }) {
  const skipped = s.liveSkipped ?? [];
  const stops = s.stops.filter((x) => !skipped.includes(x.id));
  const points = [
    ...(s.pickup ? [{ id: "pickup", lat: s.pickup.lat, lng: s.pickup.lng, label: "P", title: s.pickupText, kind: "pickup" as const }] : []),
    ...stops.filter((x) => x.lat != null && x.lng != null).map((x, i) => ({ id: x.id, lat: x.lat!, lng: x.lng!, label: String(i + 1), title: x.name, kind: "stop" as const })),
    ...(s.end ? [{ id: "end", lat: s.end.lat, lng: s.end.lng, label: "E", title: s.endText, kind: "end" as const }] : s.pickup && stops.length ? [{ id: "back", lat: s.pickup.lat, lng: s.pickup.lng, label: "P", title: w.backAtHotel, kind: "end" as const }] : []),
  ];
  const dot = "absolute left-0 top-0 grid size-10 place-items-center rounded-full";
  return <div id={id} className="scroll-mt-[140px] lg:scroll-mt-[168px]">
    {title && <h3 className="mb-3 text-[19px] font-bold">{title}</h3>}
    {points.length > 0 && <div className="mb-5 overflow-hidden rounded-2xl border border-slate-200"><ItineraryMap points={points} /></div>}
    <ol className="relative grid gap-6 before:absolute before:bottom-5 before:left-5 before:top-5 before:w-0.5 before:-translate-x-1/2 before:bg-slate-200">
      <li className="relative min-h-10 pl-14">
        <span aria-hidden className={`${dot} bg-brand-wash text-brand-deep`}><MapPin size={20} /></span>
        <p className="pt-1.5 text-[18px] font-bold"><span className="tabular-nums">{s.startTime}</span> · {w.departure}</p>
        <p className="mt-0.5 text-[15px] text-slate-600">{s.pickupText || w.hotelPickup}</p>
      </li>
      {stops.map((st) => {
        const photos = [st.cover, ...st.gallery].filter((x, i, all): x is string => Boolean(x) && all.indexOf(x) === i);
        return <li key={st.id} className="relative pl-14">
          <span aria-hidden className={`${dot} bg-emerald-50 text-emerald-700`}><Landmark size={19} /></span>
          <h4 className="pt-1.5 text-[18px] font-bold">{st.name}</h4>
          {st.program && <p className="mt-0.5 text-[14px] text-slate-600">{st.program}</p>}
          {st.checkIn != null && <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-2.5 py-1 text-[13px] font-semibold text-[#9A4D00]"><Ticket size={14} />{fill(w.sessionCheckIn, { time: st.sessionTime ?? "", checkIn: hhmm(st.checkIn) })}</p>}
          {photos.length > 0 && <div className="relative mt-3 overflow-hidden rounded-2xl">
            <img src={photos[0]} alt={st.name} className="aspect-[16/10] w-full object-cover" loading="lazy" />
            {photos.length > 1 && <span className="absolute bottom-2.5 right-2.5 rounded-lg bg-black/65 px-2 py-0.5 text-[14px] font-bold text-white">+{photos.length - 1}</span>}
          </div>}
        </li>;
      })}
      <li className="relative min-h-10 pl-14">
        <span aria-hidden className={`${dot} bg-brand-wash text-brand-deep`}><MapPin size={20} /></span>
        <p className="pt-1.5 text-[18px] font-bold"><span className="tabular-nums">{hhmm(s.returnAt)}</span> · {w.returnLabel}</p>
        <p className="mt-0.5 text-[15px] text-slate-600">{s.end ? s.endText : w.backAtHotel}</p>
      </li>
    </ol>
    <p className="mt-4 text-[13px] text-slate-500">* {w.timesNote}</p>
  </div>;
}
